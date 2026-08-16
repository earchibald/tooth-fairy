terraform {
  required_version = ">= 1.5"
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = ">= 5.0"
    }
    archive = {
      source  = "hashicorp/archive"
      version = ">= 2.4"
    }
  }
}

data "aws_region" "current" {}

# --- bucket: private, encrypted, TLS-only, expiring ------------------

resource "aws_s3_bucket" "submissions" {
  bucket = var.bucket_name
}

resource "aws_s3_bucket_public_access_block" "submissions" {
  bucket                  = aws_s3_bucket.submissions.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_server_side_encryption_configuration" "submissions" {
  bucket = aws_s3_bucket.submissions.id
  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

resource "aws_s3_bucket_lifecycle_configuration" "submissions" {
  bucket = aws_s3_bucket.submissions.id
  rule {
    id     = "expire-submissions"
    status = "Enabled"
    filter {
      prefix = "submissions/"
    }
    expiration {
      days = var.expire_days
    }
  }
  rule {
    id     = "abort-incomplete-multipart"
    status = "Enabled"
    filter {}
    abort_incomplete_multipart_upload {
      days_after_initiation = 7
    }
  }
}

resource "aws_s3_bucket_cors_configuration" "submissions" {
  bucket = aws_s3_bucket.submissions.id
  cors_rule {
    allowed_methods = ["POST"]
    allowed_origins = var.allowed_origins
    allowed_headers = ["*"]
    max_age_seconds = 300
  }
}

data "aws_iam_policy_document" "tls_only" {
  statement {
    sid     = "DenyInsecureTransport"
    effect  = "Deny"
    actions = ["s3:*"]
    principals {
      type        = "*"
      identifiers = ["*"]
    }
    resources = [
      aws_s3_bucket.submissions.arn,
      "${aws_s3_bucket.submissions.arn}/*",
    ]
    condition {
      test     = "Bool"
      variable = "aws:SecureTransport"
      values   = ["false"]
    }
  }
}

resource "aws_s3_bucket_policy" "tls_only" {
  bucket     = aws_s3_bucket.submissions.id
  policy     = data.aws_iam_policy_document.tls_only.json
  depends_on = [aws_s3_bucket_public_access_block.submissions]
}

# --- broker lambda + function URL ------------------------------------

data "archive_file" "broker" {
  type        = "zip"
  source_dir  = "${path.module}/lambda"
  output_path = "${path.module}/lambda.zip"
}

data "aws_iam_policy_document" "lambda_assume" {
  statement {
    actions = ["sts:AssumeRole"]
    principals {
      type        = "Service"
      identifiers = ["lambda.amazonaws.com"]
    }
  }
}

resource "aws_iam_role" "broker" {
  name               = "${var.name}-broker"
  assume_role_policy = data.aws_iam_policy_document.lambda_assume.json
}

data "aws_iam_policy_document" "broker" {
  statement {
    sid       = "PutSubmissionsOnly"
    actions   = ["s3:PutObject"]
    resources = ["${aws_s3_bucket.submissions.arn}/submissions/*"]
  }
  statement {
    sid       = "Logs"
    actions   = ["logs:CreateLogGroup", "logs:CreateLogStream", "logs:PutLogEvents"]
    resources = ["arn:aws:logs:*:*:*"]
  }
}

resource "aws_iam_role_policy" "broker" {
  name   = "broker"
  role   = aws_iam_role.broker.id
  policy = data.aws_iam_policy_document.broker.json
}

resource "aws_lambda_function" "broker" {
  function_name    = "${var.name}-broker"
  role             = aws_iam_role.broker.arn
  runtime          = "nodejs22.x"
  handler          = "broker.handler"
  filename         = data.archive_file.broker.output_path
  source_code_hash = data.archive_file.broker.output_base64sha256
  timeout          = 10
  environment {
    variables = {
      BUCKET            = aws_s3_bucket.submissions.bucket
      SUBMIT_TOKEN      = var.submit_token
      SUBMISSION_SCHEMA = var.schema
    }
  }
}

resource "aws_lambda_function_url" "broker" {
  function_name      = aws_lambda_function.broker.function_name
  authorization_type = "NONE"
  cors {
    allow_origins = var.allowed_origins
    allow_methods = ["POST"]
    allow_headers = ["content-type"]
    max_age       = 300
  }
}

resource "aws_lambda_permission" "broker_url_public" {
  statement_id           = "AllowPublicFunctionUrl"
  action                 = "lambda:InvokeFunctionUrl"
  function_name          = aws_lambda_function.broker.function_name
  principal              = "*"
  function_url_auth_type = "NONE"
}

# --- analyst: retrieval principal -------------------------------------
# Read/delete/list scoped to submissions/*, gated on create_analyst_user
# so a consumer can retrieve submissions some other way instead.

resource "aws_iam_user" "analyst" {
  count = var.create_analyst_user ? 1 : 0
  name  = "${var.name}-analyst"
}

data "aws_iam_policy_document" "analyst" {
  count = var.create_analyst_user ? 1 : 0
  statement {
    sid       = "ReadDeleteSubmissions"
    actions   = ["s3:GetObject", "s3:DeleteObject"]
    resources = ["${aws_s3_bucket.submissions.arn}/submissions/*"]
  }
  statement {
    sid       = "ListSubmissions"
    actions   = ["s3:ListBucket"]
    resources = [aws_s3_bucket.submissions.arn]
    condition {
      test     = "StringLike"
      variable = "s3:prefix"
      values   = ["submissions/*"]
    }
  }
}

resource "aws_iam_user_policy" "analyst" {
  count  = var.create_analyst_user ? 1 : 0
  name   = "analyst"
  user   = aws_iam_user.analyst[0].name
  policy = data.aws_iam_policy_document.analyst[0].json
}

resource "aws_iam_access_key" "analyst" {
  count = var.create_analyst_user ? 1 : 0
  user  = aws_iam_user.analyst[0].name
}
