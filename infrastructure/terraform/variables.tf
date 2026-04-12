# ── variables.tf ───────────────────────────────────────────────────────────────

variable "aws_region" {
  description = "AWS region to deploy into"
  type        = string
  default     = "ap-south-1"
}

variable "environment" {
  description = "Deployment environment (production, staging)"
  type        = string
  default     = "production"
}

variable "app_port" {
  description = "Port the Node.js app listens on"
  type        = number
  default     = 3000
}

variable "app_url" {
  description = "Public HTTPS URL of the app (used for Twilio webhooks)"
  type        = string
}

variable "db_instance_class" {
  description = "RDS instance class"
  type        = string
  default     = "db.t3.micro"
}

variable "db_username" {
  description = "PostgreSQL master username"
  type        = string
  default     = "kuralai_user"
}

variable "db_password" {
  description = "PostgreSQL master password"
  type        = string
  sensitive   = true
}

variable "s3_bucket_name" {
  description = "S3 bucket for audio file storage"
  type        = string
  default     = "kuralai-audio-storage"
}

variable "fargate_cpu" {
  description = "Fargate task CPU units (256, 512, 1024, 2048)"
  type        = string
  default     = "512"
}

variable "fargate_memory" {
  description = "Fargate task memory in MB"
  type        = string
  default     = "1024"
}

variable "ecs_desired_count" {
  description = "Number of ECS task replicas"
  type        = number
  default     = 2
}

variable "acm_certificate_arn" {
  description = "ACM certificate ARN for HTTPS on ALB"
  type        = string
}

variable "azure_speech_region" {
  description = "Azure Speech Services region"
  type        = string
  default     = "eastus"
}
