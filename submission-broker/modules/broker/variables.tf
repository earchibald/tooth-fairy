variable "name" {
  description = "Resource name prefix. Used for the Lambda, its IAM role, and the analyst user."
  type        = string
}

variable "bucket_name" {
  description = "Globally unique S3 bucket name for submissions."
  type        = string
}

variable "allowed_origins" {
  description = "Browser origins allowed to POST to the broker and upload to the bucket."
  type        = list(string)
}

variable "submit_token" {
  description = "Shared secret the browser must present to receive a grant."
  type        = string
  sensitive   = true
}

variable "schema" {
  description = "The JSON submission schema document, passed to the Lambda as SUBMISSION_SCHEMA."
  type        = string
}

variable "expire_days" {
  description = "Days before submitted objects expire."
  type        = number
  default     = 90
}

variable "create_analyst_user" {
  description = "Whether to create a read/delete IAM user and access key for retrieval."
  type        = bool
  default     = true
}
