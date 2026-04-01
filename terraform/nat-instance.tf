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

  tags = merge(local.common_tags, {
    Name = "${local.name_prefix}-nat-instance-sg"
  })

  lifecycle {
    create_before_destroy = true
  }
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
    service iptables save
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
