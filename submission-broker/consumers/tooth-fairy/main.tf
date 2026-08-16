terraform {
  required_version = ">= 1.5"
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = ">= 5.0"
    }
  }
}

provider "aws" {
  region = "us-east-1"
}

module "broker" {
  source = "../../modules/broker"

  name            = "tooth-fairy"
  bucket_name     = "earchibald-tf-session-submissions"
  allowed_origins = ["http://localhost:8123", "https://earchibald.github.io"]
  submit_token    = var.submit_token
  schema          = file("${path.module}/schema.json")
}

variable "submit_token" {
  description = "Shared submit token; also set as the deploy secret consumed by js/submit/env.js."
  type        = string
  sensitive   = true
}

output "bucket" {
  value = module.broker.bucket
}

output "region" {
  value = module.broker.region
}

output "function_url" {
  value = module.broker.function_url
}

output "analyst_access_key_id" {
  value = module.broker.analyst_access_key_id
}

output "analyst_secret_access_key" {
  value     = module.broker.analyst_secret_access_key
  sensitive = true
}
