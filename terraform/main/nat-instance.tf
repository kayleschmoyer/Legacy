# Lightweight NAT Instance for Google API Access
# Cost-effective alternative to NAT Gateway (~$3-8/month vs $45/month)

# Data source for the latest Amazon Linux 2 AMI (we'll configure NAT manually)
data "aws_ami" "nat_instance" {
  most_recent = true
  owners      = ["amazon"]

  filter {
    name   = "name"
    values = ["amzn2-ami-hvm-*-x86_64-gp2"]
  }

  filter {
    name   = "virtualization-type"
    values = ["hvm"]
  }
}

# Security Group for NAT Instance
resource "aws_security_group" "nat_instance" {
  name_prefix = "${local.name_prefix}-nat-instance-"
  vpc_id      = aws_vpc.main.id
  description = "Security group for NAT instance"

  # HTTPS-only — all external API traffic uses TLS; no HTTP ingress needed
  ingress {
    from_port   = 443
    to_port     = 443
    protocol    = "tcp"
    cidr_blocks = [for subnet in aws_subnet.private_lambda : subnet.cidr_block]
    description = "HTTPS from private Lambda subnets"
  }

  # HTTPS-only outbound — all external API traffic uses HTTPS
  egress {
    from_port   = 443
    to_port     = 443
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
    description = "HTTPS to external APIs (Google, Rollbar, Sentry, Stripe)"
  }

  # RDS port-forward outbound — SSM port-forwarding establishes a TCP connection
  # to RDS on 5432 through this instance; without this egress rule the tunnel is blocked.
  egress {
    from_port   = 5432
    to_port     = 5432
    protocol    = "tcp"
    cidr_blocks = [aws_vpc.main.cidr_block]
    description = "PostgreSQL to RDS (SSM port-forwarding tunnel)"
  }

  tags = merge(local.common_tags, {
    Name = "${local.name_prefix}-nat-instance-sg"
  })

  lifecycle {
    create_before_destroy = true
  }
}

# IAM role for NAT instance — enables SSM Session Manager so developers can
# port-forward to RDS locally without opening public SG rules.
# Guarded by the same condition as aws_instance.nat_instance to avoid leaving
# unused IAM resources when var.use_nat_instance is false.
resource "aws_iam_role" "nat_instance" {
  count = var.use_nat_instance ? 1 : 0

  name = "${local.name_prefix}-nat-instance"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Action = "sts:AssumeRole"
        Effect = "Allow"
        Principal = {
          Service = "ec2.amazonaws.com"
        }
      }
    ]
  })

  tags = local.common_tags
}

resource "aws_iam_role_policy_attachment" "nat_instance_ssm" {
  count = var.use_nat_instance ? 1 : 0

  role       = aws_iam_role.nat_instance[0].name
  policy_arn = "arn:aws:iam::aws:policy/AmazonSSMManagedInstanceCore"
}

resource "aws_iam_instance_profile" "nat_instance" {
  count = var.use_nat_instance ? 1 : 0

  name = "${local.name_prefix}-nat-instance"
  role = aws_iam_role.nat_instance[0].name

  # The GitHub Actions apply role needs iam:CreateInstanceProfile, which is
  # granted by github_actions_additional. Without this dependency, Terraform
  # creates the instance profile in parallel with updating the policy, causing
  # an AccessDenied race on the first apply after the permission was added.
  depends_on = [aws_iam_role_policy.github_actions_additional]
}

# NAT Instance (only create if cost optimization is enabled)
resource "aws_instance" "nat_instance" {
  count = var.use_nat_instance ? 1 : 0

  ami                         = data.aws_ami.nat_instance.id
  instance_type               = "t3.nano" # Minimal instance type (~$3.80/month)
  subnet_id                   = aws_subnet.public[0].id
  vpc_security_group_ids      = [aws_security_group.nat_instance.id]
  associate_public_ip_address = true
  source_dest_check           = false # Required for NAT functionality
  iam_instance_profile        = aws_iam_instance_profile.nat_instance[0].name

  # The heredoc below is plaintext; we explicitly base64-encode it and provide
  # the encoded value via user_data_base64 (instead of using user_data, which
  # expects plaintext and handles encoding internally).
  user_data_base64 = base64encode(<<-EOF
    #!/bin/bash
    yum update -y
    echo 1 > /proc/sys/net/ipv4/ip_forward
    echo 'net.ipv4.ip_forward = 1' >> /etc/sysctl.conf
    /sbin/iptables -t nat -A POSTROUTING -o eth0 -j MASQUERADE
    /sbin/iptables -F FORWARD
    /sbin/iptables-save > /etc/sysconfig/iptables
    EOF
  )

  tags = merge(local.common_tags, {
    Name    = "${local.name_prefix}-nat-instance"
    Purpose = "Cost-effective NAT for Google API access"
  })
}

# Update route table to use NAT instance instead of NAT Gateway
resource "aws_route" "private_lambda_internet" {
  count = var.use_nat_instance ? length(aws_route_table.private_lambda) : 0

  route_table_id         = aws_route_table.private_lambda[count.index].id
  destination_cidr_block = "0.0.0.0/0"
  network_interface_id   = aws_instance.nat_instance[0].primary_network_interface_id
}

# Elastic IP for NAT instance (optional, for static IP)
resource "aws_eip" "nat_instance" {
  count = var.use_nat_instance ? 1 : 0

  instance = aws_instance.nat_instance[0].id
  domain   = "vpc"

  tags = merge(local.common_tags, {
    Name = "${local.name_prefix}-nat-instance-eip"
  })

  depends_on = [aws_internet_gateway.main]
}

# Output NAT instance information
output "nat_instance" {
  description = "NAT Instance information"
  value = var.use_nat_instance ? {
    id           = aws_instance.nat_instance[0].id
    private_ip   = aws_instance.nat_instance[0].private_ip
    public_ip    = aws_eip.nat_instance[0].public_ip
    cost_savings = "Saves ~$37/month compared to NAT Gateway"
  } : null
}
