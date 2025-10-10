# API Gateway REST API
resource "aws_api_gateway_rest_api" "main" {
  name        = "${local.name_prefix}-api"
  description = "Legacy Sports API Gateway"

  endpoint_configuration {
    types = ["REGIONAL"]
  }

  tags = local.common_tags
}

# API Gateway Deployment
resource "aws_api_gateway_deployment" "main" {
  rest_api_id = aws_api_gateway_rest_api.main.id

  triggers = {
    redeployment = sha1(jsonencode([
      aws_api_gateway_resource.graphql.id,
      aws_api_gateway_method.graphql_get.id,
      aws_api_gateway_method.graphql_post.id,
      aws_api_gateway_method.graphql_options.id,
      aws_api_gateway_integration.graphql_get.id,
      aws_api_gateway_integration.graphql_post.id,
      aws_api_gateway_integration.graphql_options.id,
      # OAuth Proxy resources
      aws_api_gateway_resource.oauth_proxy.id,
      aws_api_gateway_resource.oauth_proxy_paths.id,
      aws_api_gateway_method.oauth_proxy_root_any.id,
      aws_api_gateway_method.oauth_proxy_root_options.id,
      aws_api_gateway_method.oauth_proxy_any.id,
      aws_api_gateway_method.oauth_proxy_options.id,
      aws_api_gateway_integration.oauth_proxy_root_any.id,
      aws_api_gateway_integration.oauth_proxy_root_options.id,
      aws_api_gateway_integration.oauth_proxy_any.id,
      aws_api_gateway_integration.oauth_proxy_options.id,
      # Stats resources
      aws_api_gateway_resource.stats.id,
      aws_api_gateway_resource.stats_paths.id,
      aws_api_gateway_method.stats_post.id,
      aws_api_gateway_method.stats_options.id,
      aws_api_gateway_integration.stats_post.id,
      aws_api_gateway_integration.stats_options.id,
      # Game Selection resources
      aws_api_gateway_resource.game_selection.id,
      aws_api_gateway_resource.game_selection_paths.id,
      aws_api_gateway_method.game_selection_any.id,
      aws_api_gateway_method.game_selection_options.id,
      aws_api_gateway_integration.game_selection_any.id,
      aws_api_gateway_integration.game_selection_options.id,
    ]))
  }

  lifecycle {
    create_before_destroy = true
  }

  depends_on = [
    aws_api_gateway_method.graphql_get,
    aws_api_gateway_method.graphql_post,
    aws_api_gateway_method.graphql_options,
    aws_api_gateway_integration.graphql_get,
    aws_api_gateway_integration.graphql_post,
    aws_api_gateway_integration.graphql_options,
  ]
}

# API Gateway Stage
resource "aws_api_gateway_stage" "main" {
  deployment_id = aws_api_gateway_deployment.main.id
  rest_api_id   = aws_api_gateway_rest_api.main.id
  stage_name    = var.environment

  tags = local.common_tags
}

# GraphQL resource
resource "aws_api_gateway_resource" "graphql" {
  rest_api_id = aws_api_gateway_rest_api.main.id
  parent_id   = aws_api_gateway_rest_api.main.root_resource_id
  path_part   = "graphql"
}

# GraphQL POST method
resource "aws_api_gateway_method" "graphql_post" {
  rest_api_id   = aws_api_gateway_rest_api.main.id
  resource_id   = aws_api_gateway_resource.graphql.id
  http_method   = "POST"
  authorization = "NONE"
}

# GraphQL GET method for Explorer/Playground
resource "aws_api_gateway_method" "graphql_get" {
  rest_api_id   = aws_api_gateway_rest_api.main.id
  resource_id   = aws_api_gateway_resource.graphql.id
  http_method   = "GET"
  authorization = "NONE"
}

# GraphQL OPTIONS method for CORS
resource "aws_api_gateway_method" "graphql_options" {
  rest_api_id   = aws_api_gateway_rest_api.main.id
  resource_id   = aws_api_gateway_resource.graphql.id
  http_method   = "OPTIONS"
  authorization = "NONE"
}

# GraphQL POST integration
resource "aws_api_gateway_integration" "graphql_post" {
  rest_api_id = aws_api_gateway_rest_api.main.id
  resource_id = aws_api_gateway_resource.graphql.id
  http_method = aws_api_gateway_method.graphql_post.http_method

  integration_http_method = "POST"
  type                    = "AWS_PROXY"
  uri                     = aws_lambda_function.graphql.invoke_arn
}

# GraphQL GET integration for Explorer/Playground
resource "aws_api_gateway_integration" "graphql_get" {
  rest_api_id = aws_api_gateway_rest_api.main.id
  resource_id = aws_api_gateway_resource.graphql.id
  http_method = aws_api_gateway_method.graphql_get.http_method

  integration_http_method = "POST"
  type                    = "AWS_PROXY"
  uri                     = aws_lambda_function.graphql.invoke_arn
}

# GraphQL OPTIONS integration for CORS
resource "aws_api_gateway_integration" "graphql_options" {
  rest_api_id = aws_api_gateway_rest_api.main.id
  resource_id = aws_api_gateway_resource.graphql.id
  http_method = aws_api_gateway_method.graphql_options.http_method

  type = "MOCK"
  request_templates = {
    "application/json" = jsonencode({
      statusCode = 200
    })
  }
}

# GraphQL POST method response
resource "aws_api_gateway_method_response" "graphql_post" {
  rest_api_id = aws_api_gateway_rest_api.main.id
  resource_id = aws_api_gateway_resource.graphql.id
  http_method = aws_api_gateway_method.graphql_post.http_method
  status_code = "200"

  response_parameters = {
    "method.response.header.Access-Control-Allow-Origin"  = true
    "method.response.header.Access-Control-Allow-Headers" = true
    "method.response.header.Access-Control-Allow-Methods" = true
  }
}

# GraphQL GET method response for Explorer/Playground
resource "aws_api_gateway_method_response" "graphql_get" {
  rest_api_id = aws_api_gateway_rest_api.main.id
  resource_id = aws_api_gateway_resource.graphql.id
  http_method = aws_api_gateway_method.graphql_get.http_method
  status_code = "200"

  response_parameters = {
    "method.response.header.Access-Control-Allow-Origin"  = true
    "method.response.header.Access-Control-Allow-Headers" = true
    "method.response.header.Access-Control-Allow-Methods" = true
  }
}

# GraphQL OPTIONS method response for CORS
resource "aws_api_gateway_method_response" "graphql_options" {
  rest_api_id = aws_api_gateway_rest_api.main.id
  resource_id = aws_api_gateway_resource.graphql.id
  http_method = aws_api_gateway_method.graphql_options.http_method
  status_code = "200"

  response_parameters = {
    "method.response.header.Access-Control-Allow-Origin"  = true
    "method.response.header.Access-Control-Allow-Headers" = true
    "method.response.header.Access-Control-Allow-Methods" = true
  }
}

# GraphQL POST integration response
resource "aws_api_gateway_integration_response" "graphql_post" {
  rest_api_id = aws_api_gateway_rest_api.main.id
  resource_id = aws_api_gateway_resource.graphql.id
  http_method = aws_api_gateway_method.graphql_post.http_method
  status_code = aws_api_gateway_method_response.graphql_post.status_code

  response_parameters = {
    "method.response.header.Access-Control-Allow-Origin"  = "'*'"
    "method.response.header.Access-Control-Allow-Headers" = "'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token'"
    "method.response.header.Access-Control-Allow-Methods" = "'GET,POST,OPTIONS'"
  }

  depends_on = [aws_api_gateway_integration.graphql_post]
}

# GraphQL GET integration response for Explorer/Playground
resource "aws_api_gateway_integration_response" "graphql_get" {
  rest_api_id = aws_api_gateway_rest_api.main.id
  resource_id = aws_api_gateway_resource.graphql.id
  http_method = aws_api_gateway_method.graphql_get.http_method
  status_code = aws_api_gateway_method_response.graphql_get.status_code

  response_parameters = {
    "method.response.header.Access-Control-Allow-Origin"  = "'*'"
    "method.response.header.Access-Control-Allow-Headers" = "'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token'"
    "method.response.header.Access-Control-Allow-Methods" = "'GET,POST,OPTIONS'"
  }

  depends_on = [aws_api_gateway_integration.graphql_get]
}

# GraphQL OPTIONS integration response for CORS
resource "aws_api_gateway_integration_response" "graphql_options" {
  rest_api_id = aws_api_gateway_rest_api.main.id
  resource_id = aws_api_gateway_resource.graphql.id
  http_method = aws_api_gateway_method.graphql_options.http_method
  status_code = aws_api_gateway_method_response.graphql_options.status_code

  response_parameters = {
    "method.response.header.Access-Control-Allow-Origin"  = "'*'"
    "method.response.header.Access-Control-Allow-Headers" = "'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token'"
    "method.response.header.Access-Control-Allow-Methods" = "'GET,POST,OPTIONS'"
  }

  depends_on = [aws_api_gateway_integration.graphql_options]
}
