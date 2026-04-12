/**
 * KuralAI - AWS Infrastructure (Terraform)
 * Provisions: VPC, RDS PostgreSQL, S3, ECR, ECS Fargate, ALB, IAM
 *
 * Usage:
 *   terraform init
 *   terraform plan -var-file="terraform.tfvars"
 *   terraform apply -var-file="terraform.tfvars"
 */

terraform {
  required_version = ">= 1.6"
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }
  # Uncomment to use S3 backend for remote state:
  # backend "s3" {
  #   bucket = "kuralai-terraform-state"
  #   key    = "prod/terraform.tfstate"
  #   region = "ap-south-1"
  # }
}

provider "aws" {
  region = var.aws_region
}

# ── Data ───────────────────────────────────────────────────────────────────────

data "aws_availability_zones" "available" {}

# ── VPC ────────────────────────────────────────────────────────────────────────

resource "aws_vpc" "kuralai" {
  cidr_block           = "10.0.0.0/16"
  enable_dns_hostnames = true
  enable_dns_support   = true

  tags = { Name = "kuralai-vpc", Project = "KuralAI" }
}

resource "aws_internet_gateway" "kuralai" {
  vpc_id = aws_vpc.kuralai.id
  tags   = { Name = "kuralai-igw" }
}

resource "aws_subnet" "public" {
  count                   = 2
  vpc_id                  = aws_vpc.kuralai.id
  cidr_block              = "10.0.${count.index}.0/24"
  availability_zone       = data.aws_availability_zones.available.names[count.index]
  map_public_ip_on_launch = true
  tags                    = { Name = "kuralai-public-${count.index}", Type = "public" }
}

resource "aws_subnet" "private" {
  count             = 2
  vpc_id            = aws_vpc.kuralai.id
  cidr_block        = "10.0.${count.index + 10}.0/24"
  availability_zone = data.aws_availability_zones.available.names[count.index]
  tags              = { Name = "kuralai-private-${count.index}", Type = "private" }
}

resource "aws_route_table" "public" {
  vpc_id = aws_vpc.kuralai.id
  route {
    cidr_block = "0.0.0.0/0"
    gateway_id = aws_internet_gateway.kuralai.id
  }
  tags = { Name = "kuralai-public-rt" }
}

resource "aws_route_table_association" "public" {
  count          = 2
  subnet_id      = aws_subnet.public[count.index].id
  route_table_id = aws_route_table.public.id
}

# NAT Gateway for private subnets (ECS tasks need outbound internet for APIs)
resource "aws_eip" "nat" {
  domain = "vpc"
}

resource "aws_nat_gateway" "kuralai" {
  allocation_id = aws_eip.nat.id
  subnet_id     = aws_subnet.public[0].id
  tags          = { Name = "kuralai-nat" }
}

resource "aws_route_table" "private" {
  vpc_id = aws_vpc.kuralai.id
  route {
    cidr_block     = "0.0.0.0/0"
    nat_gateway_id = aws_nat_gateway.kuralai.id
  }
  tags = { Name = "kuralai-private-rt" }
}

resource "aws_route_table_association" "private" {
  count          = 2
  subnet_id      = aws_subnet.private[count.index].id
  route_table_id = aws_route_table.private.id
}

# ── Security Groups ────────────────────────────────────────────────────────────

resource "aws_security_group" "alb" {
  name        = "kuralai-alb-sg"
  description = "Allow HTTP/HTTPS to ALB"
  vpc_id      = aws_vpc.kuralai.id

  ingress {
    from_port   = 80
    to_port     = 80
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }
  ingress {
    from_port   = 443
    to_port     = 443
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }
  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }
  tags = { Name = "kuralai-alb-sg" }
}

resource "aws_security_group" "ecs" {
  name        = "kuralai-ecs-sg"
  description = "Allow traffic from ALB to ECS"
  vpc_id      = aws_vpc.kuralai.id

  ingress {
    from_port       = var.app_port
    to_port         = var.app_port
    protocol        = "tcp"
    security_groups = [aws_security_group.alb.id]
  }
  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }
  tags = { Name = "kuralai-ecs-sg" }
}

resource "aws_security_group" "rds" {
  name        = "kuralai-rds-sg"
  description = "Allow PostgreSQL from ECS only"
  vpc_id      = aws_vpc.kuralai.id

  ingress {
    from_port       = 5432
    to_port         = 5432
    protocol        = "tcp"
    security_groups = [aws_security_group.ecs.id]
  }
  tags = { Name = "kuralai-rds-sg" }
}

# ── RDS PostgreSQL ─────────────────────────────────────────────────────────────

resource "aws_db_subnet_group" "kuralai" {
  name       = "kuralai-db-subnet"
  subnet_ids = aws_subnet.private[*].id
  tags       = { Name = "kuralai-db-subnet" }
}

resource "aws_db_instance" "kuralai" {
  identifier              = "kuralai-postgres"
  engine                  = "postgres"
  engine_version          = "15.4"
  instance_class          = var.db_instance_class
  allocated_storage       = 20
  max_allocated_storage   = 100
  storage_encrypted       = true
  db_name                 = "kuralai"
  username                = var.db_username
  password                = var.db_password
  db_subnet_group_name    = aws_db_subnet_group.kuralai.name
  vpc_security_group_ids  = [aws_security_group.rds.id]
  skip_final_snapshot     = false
  final_snapshot_identifier = "kuralai-final-${formatdate("YYYY-MM-DD", timestamp())}"
  deletion_protection     = true
  backup_retention_period = 7
  backup_window           = "03:00-04:00"
  maintenance_window      = "sun:04:00-sun:05:00"
  multi_az                = var.environment == "production"

  tags = { Name = "kuralai-postgres", Environment = var.environment }
}

# ── S3 Bucket ──────────────────────────────────────────────────────────────────

resource "aws_s3_bucket" "audio" {
  bucket        = var.s3_bucket_name
  force_destroy = var.environment != "production"
  tags          = { Name = "kuralai-audio", Environment = var.environment }
}

resource "aws_s3_bucket_versioning" "audio" {
  bucket = aws_s3_bucket.audio.id
  versioning_configuration { status = "Enabled" }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "audio" {
  bucket = aws_s3_bucket.audio.id
  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

resource "aws_s3_bucket_public_access_block" "audio" {
  bucket                  = aws_s3_bucket.audio.id
  block_public_acls       = true
  ignore_public_acls      = true
  block_public_policy     = true
  restrict_public_buckets = true
}

# CORS for presigned URL audio playback (Twilio needs to fetch the audio)
resource "aws_s3_bucket_cors_configuration" "audio" {
  bucket = aws_s3_bucket.audio.id
  cors_rule {
    allowed_methods = ["GET"]
    allowed_origins = ["https://api.twilio.com", var.app_url]
    max_age_seconds = 3600
  }
}

# ── ECR Repository ─────────────────────────────────────────────────────────────

resource "aws_ecr_repository" "kuralai" {
  name                 = "kuralai-backend"
  image_tag_mutability = "MUTABLE"

  image_scanning_configuration {
    scan_on_push = true
  }

  tags = { Name = "kuralai-backend" }
}

resource "aws_ecr_lifecycle_policy" "kuralai" {
  repository = aws_ecr_repository.kuralai.name
  policy = jsonencode({
    rules = [{
      rulePriority = 1
      description  = "Keep last 10 images"
      selection    = { tagStatus = "any", countType = "imageCountMoreThan", countNumber = 10 }
      action       = { type = "expire" }
    }]
  })
}

# ── IAM ────────────────────────────────────────────────────────────────────────

resource "aws_iam_role" "ecs_task_execution" {
  name = "kuralai-ecs-task-execution"
  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Action    = "sts:AssumeRole"
      Effect    = "Allow"
      Principal = { Service = "ecs-tasks.amazonaws.com" }
    }]
  })
}

resource "aws_iam_role_policy_attachment" "ecs_task_execution" {
  role       = aws_iam_role.ecs_task_execution.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy"
}

resource "aws_iam_role" "ecs_task" {
  name = "kuralai-ecs-task"
  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Action    = "sts:AssumeRole"
      Effect    = "Allow"
      Principal = { Service = "ecs-tasks.amazonaws.com" }
    }]
  })
}

resource "aws_iam_role_policy" "ecs_task_s3" {
  name = "kuralai-s3-access"
  role = aws_iam_role.ecs_task.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect   = "Allow"
      Action   = ["s3:PutObject", "s3:GetObject", "s3:DeleteObject"]
      Resource = "${aws_s3_bucket.audio.arn}/*"
    }]
  })
}

# ── CloudWatch Logs ────────────────────────────────────────────────────────────

resource "aws_cloudwatch_log_group" "kuralai" {
  name              = "/ecs/kuralai"
  retention_in_days = 30
  tags              = { Project = "KuralAI" }
}

# ── ECS Cluster + Fargate ──────────────────────────────────────────────────────

resource "aws_ecs_cluster" "kuralai" {
  name = "kuralai-cluster"
  setting {
    name  = "containerInsights"
    value = "enabled"
  }
  tags = { Name = "kuralai-cluster" }
}

resource "aws_ecs_task_definition" "kuralai" {
  family                   = "kuralai-backend"
  network_mode             = "awsvpc"
  requires_compatibilities = ["FARGATE"]
  cpu                      = var.fargate_cpu
  memory                   = var.fargate_memory
  execution_role_arn       = aws_iam_role.ecs_task_execution.arn
  task_role_arn            = aws_iam_role.ecs_task.arn

  container_definitions = jsonencode([{
    name      = "kuralai-backend"
    image     = "${aws_ecr_repository.kuralai.repository_url}:latest"
    essential = true
    portMappings = [{
      containerPort = var.app_port
      protocol      = "tcp"
    }]
    environment = [
      { name = "NODE_ENV",             value = "production" },
      { name = "PORT",                 value = tostring(var.app_port) },
      { name = "DB_HOST",              value = aws_db_instance.kuralai.address },
      { name = "DB_PORT",              value = "5432" },
      { name = "DB_NAME",              value = "kuralai" },
      { name = "DB_USER",              value = var.db_username },
      { name = "DB_SSL",               value = "true" },
      { name = "AWS_REGION",           value = var.aws_region },
      { name = "S3_BUCKET_NAME",       value = var.s3_bucket_name },
      { name = "APP_URL",              value = var.app_url },
      { name = "AZURE_SPEECH_REGION",  value = var.azure_speech_region },
      { name = "AZURE_SPEECH_VOICE",   value = "ta-IN-PallaviNeural" },
    ]
    secrets = [
      { name = "DB_PASSWORD",           valueFrom = "${aws_secretsmanager_secret.kuralai.arn}:db_password::" },
      { name = "JWT_SECRET",            valueFrom = "${aws_secretsmanager_secret.kuralai.arn}:jwt_secret::" },
      { name = "TWILIO_ACCOUNT_SID",    valueFrom = "${aws_secretsmanager_secret.kuralai.arn}:twilio_account_sid::" },
      { name = "TWILIO_AUTH_TOKEN",     valueFrom = "${aws_secretsmanager_secret.kuralai.arn}:twilio_auth_token::" },
      { name = "TWILIO_PHONE_NUMBER",   valueFrom = "${aws_secretsmanager_secret.kuralai.arn}:twilio_phone_number::" },
      { name = "OPENAI_API_KEY",        valueFrom = "${aws_secretsmanager_secret.kuralai.arn}:openai_api_key::" },
      { name = "AZURE_SPEECH_KEY",      valueFrom = "${aws_secretsmanager_secret.kuralai.arn}:azure_speech_key::" },
    ]
    logConfiguration = {
      logDriver = "awslogs"
      options = {
        awslogs-group         = aws_cloudwatch_log_group.kuralai.name
        awslogs-region        = var.aws_region
        awslogs-stream-prefix = "ecs"
      }
    }
    healthCheck = {
      command     = ["CMD-SHELL", "wget -qO- http://localhost:${var.app_port}/health || exit 1"]
      interval    = 30
      timeout     = 5
      retries     = 3
      startPeriod = 60
    }
  }])

  tags = { Name = "kuralai-backend" }
}

resource "aws_ecs_service" "kuralai" {
  name            = "kuralai-backend"
  cluster         = aws_ecs_cluster.kuralai.id
  task_definition = aws_ecs_task_definition.kuralai.arn
  desired_count   = var.ecs_desired_count
  launch_type     = "FARGATE"

  network_configuration {
    subnets          = aws_subnet.private[*].id
    security_groups  = [aws_security_group.ecs.id]
    assign_public_ip = false
  }

  load_balancer {
    target_group_arn = aws_lb_target_group.kuralai.arn
    container_name   = "kuralai-backend"
    container_port   = var.app_port
  }

  deployment_circuit_breaker {
    enable   = true
    rollback = true
  }

  depends_on = [aws_lb_listener.https]
  tags       = { Name = "kuralai-service" }
}

# ── Application Load Balancer ──────────────────────────────────────────────────

resource "aws_lb" "kuralai" {
  name               = "kuralai-alb"
  internal           = false
  load_balancer_type = "application"
  security_groups    = [aws_security_group.alb.id]
  subnets            = aws_subnet.public[*].id

  enable_deletion_protection = var.environment == "production"
  tags                       = { Name = "kuralai-alb" }
}

resource "aws_lb_target_group" "kuralai" {
  name        = "kuralai-tg"
  port        = var.app_port
  protocol    = "HTTP"
  vpc_id      = aws_vpc.kuralai.id
  target_type = "ip"

  health_check {
    path                = "/health"
    healthy_threshold   = 2
    unhealthy_threshold = 3
    interval            = 30
    timeout             = 5
  }

  tags = { Name = "kuralai-tg" }
}

# HTTP → HTTPS redirect
resource "aws_lb_listener" "http" {
  load_balancer_arn = aws_lb.kuralai.arn
  port              = 80
  protocol          = "HTTP"
  default_action {
    type = "redirect"
    redirect {
      port        = "443"
      protocol    = "HTTPS"
      status_code = "HTTP_301"
    }
  }
}

resource "aws_lb_listener" "https" {
  load_balancer_arn = aws_lb.kuralai.arn
  port              = 443
  protocol          = "HTTPS"
  ssl_policy        = "ELBSecurityPolicy-TLS13-1-2-2021-06"
  certificate_arn   = var.acm_certificate_arn

  default_action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.kuralai.arn
  }
}

# ── Secrets Manager ────────────────────────────────────────────────────────────

resource "aws_secretsmanager_secret" "kuralai" {
  name                    = "kuralai/${var.environment}/secrets"
  recovery_window_in_days = 7
  tags                    = { Project = "KuralAI", Environment = var.environment }
}

# NOTE: Secret values must be added manually after first apply:
# aws secretsmanager put-secret-value --secret-id kuralai/prod/secrets \
#   --secret-string '{"db_password":"...","jwt_secret":"...","twilio_account_sid":"...",...}'
