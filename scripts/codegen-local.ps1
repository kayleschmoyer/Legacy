# Run GraphQL codegen against local development server
# Usage: .\scripts\codegen-local.ps1

Write-Host "Running GraphQL codegen against localhost:5000..." -ForegroundColor Cyan

# Set environment variable to use local GraphQL server
$env:GRAPHQL_HOST = "http://localhost:5000/graphql"

# Run codegen for all targets
npx nx run-many --target=codegen --all

Write-Host "`nCodegen complete!" -ForegroundColor Green
Write-Host "Note: Make sure your local GraphQL server is running on port 5000" -ForegroundColor Yellow
