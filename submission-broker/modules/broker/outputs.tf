output "bucket" {
  value = aws_s3_bucket.submissions.bucket
}

output "region" {
  value = data.aws_region.current.name
}

output "function_url" {
  value = aws_lambda_function_url.broker.function_url
}

output "analyst_access_key_id" {
  value = var.create_analyst_user ? aws_iam_access_key.analyst[0].id : null
}

output "analyst_secret_access_key" {
  value     = var.create_analyst_user ? aws_iam_access_key.analyst[0].secret : null
  sensitive = true
}
