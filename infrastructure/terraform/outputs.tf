# ── outputs.tf ─────────────────────────────────────────────────────────────────

output "alb_dns_name" {
  description = "DNS name of the load balancer — point your domain CNAME here"
  value       = aws_lb.kuralai.dns_name
}

output "ecr_repository_url" {
  description = "ECR URL to push Docker images to"
  value       = aws_ecr_repository.kuralai.repository_url
}

output "rds_endpoint" {
  description = "PostgreSQL connection endpoint"
  value       = aws_db_instance.kuralai.address
  sensitive   = true
}

output "s3_bucket" {
  description = "S3 bucket name for audio files"
  value       = aws_s3_bucket.audio.bucket
}

output "secrets_manager_arn" {
  description = "ARN of the Secrets Manager secret — add credentials here"
  value       = aws_secretsmanager_secret.kuralai.arn
}

output "ecs_cluster_name" {
  description = "ECS cluster name"
  value       = aws_ecs_cluster.kuralai.name
}
