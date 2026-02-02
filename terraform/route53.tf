# Route 53 DNS Configuration
# Manages the domain name and DNS records for Legacy Sports

# Import existing hosted zone if domain was already registered
# Run: terraform import aws_route53_zone.main <ZONE_ID>
resource "aws_route53_zone" "main" {
  count = var.domain_name != "" ? 1 : 0

  name = var.domain_name

  tags = merge(local.common_tags, {
    Name        = "${local.name_prefix}-hosted-zone"
    Description = "DNS zone for Legacy Sports application"
  })
}

# GitHub Pages IP addresses for apex domain
# These are GitHub's official A record IPs
# Source: https://docs.github.com/en/pages/configuring-a-custom-domain-for-your-github-pages-site
locals {
  github_pages_ips = [
    "185.199.108.153",
    "185.199.109.153",
    "185.199.110.153",
    "185.199.111.153"
  ]
}

# Root domain A records pointing to GitHub Pages
# All GitHub Pages IPs must be in a single A record set
resource "aws_route53_record" "apex" {
  count = var.domain_name != "" ? 1 : 0

  zone_id = aws_route53_zone.main[0].zone_id
  name    = "" # Root/apex domain
  type    = "A"
  ttl     = 300
  records = local.github_pages_ips

  # Allow overwriting existing records
  allow_overwrite = true
}

# WWW subdomain CNAME to GitHub Pages
resource "aws_route53_record" "www" {
  count = var.domain_name != "" ? 1 : 0

  zone_id = aws_route53_zone.main[0].zone_id
  name    = "www"
  type    = "CNAME"
  ttl     = 300
  records = ["${var.github_username}.github.io"]
}

# API subdomain pointing to API Gateway (optional but recommended)
# This creates api.yourdomain.com for your backend
resource "aws_route53_record" "api" {
  count = var.domain_name != "" ? 1 : 0

  zone_id = aws_route53_zone.main[0].zone_id
  name    = "api"
  type    = "CNAME"
  ttl     = 300
  records = ["${aws_api_gateway_rest_api.main.id}.execute-api.${var.aws_region}.amazonaws.com"]
}

# CAA records for SSL/TLS certificate authority authorization
# Allows Let's Encrypt (used by GitHub Pages) to issue certificates
resource "aws_route53_record" "caa" {
  count = var.domain_name != "" ? 1 : 0

  zone_id = aws_route53_zone.main[0].zone_id
  name    = ""
  type    = "CAA"
  ttl     = 300
  records = [
    "0 issue \"letsencrypt.org\"",
    "0 issuewild \"letsencrypt.org\""
  ]
}

# TXT record for domain verification (if needed)
# resource "aws_route53_record" "verification" {
#   zone_id = aws_route53_zone.main.zone_id
#   name    = ""
#   type    = "TXT"
#   ttl     = 300
#   records = ["verification-string-here"]
# }

# Outputs for documentation and reference
output "route53_zone_id" {
  description = "Route 53 Hosted Zone ID"
  value       = var.domain_name != "" ? aws_route53_zone.main[0].zone_id : null
}

output "route53_name_servers" {
  description = "Name servers for the hosted zone (update domain registrar with these)"
  value       = var.domain_name != "" ? aws_route53_zone.main[0].name_servers : null
}

output "domain_name" {
  description = "Configured domain name"
  value       = var.domain_name != "" ? var.domain_name : "Not configured"
}

output "web_url" {
  description = "Web application URL"
  value       = var.domain_name != "" ? "https://${var.domain_name}" : "https://${var.github_username}.github.io/legacy-sports"
}

output "api_url" {
  description = "API endpoint URL with custom domain"
  value       = var.domain_name != "" ? "https://api.${var.domain_name}" : "https://${aws_api_gateway_rest_api.main.id}.execute-api.${var.aws_region}.amazonaws.com/${aws_api_gateway_stage.main.stage_name}"
}
