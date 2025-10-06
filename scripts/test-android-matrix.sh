#!/bin/bash

# Test script to validate the Android build matrix generation
# Simulates the GitHub Actions matrix determination logic

echo "🧪 Testing Android Build Matrix Generation..."

test_matrix_generation() {
    local matrix_type=$1
    echo "📋 Testing matrix type: $matrix_type"
    
    if [ "$matrix_type" = "production" ]; then
        MATRIX='{
            "include": [
                {
                    "name": "Production (RN 0.79.6)",
                    "os": "ubuntu-latest",
                    "java_version": "17",
                    "node_version": "22",
                    "android_api_level": "35",
                    "ndk_version": "27.1.12297006",
                    "gradle_executable": "./gradlew",
                    "cache_key_suffix": "prod"
                }
            ]
        }'
    elif [ "$matrix_type" = "compatibility" ]; then
        MATRIX='{
            "include": [
                {
                    "name": "Production (RN 0.79.6)",
                    "os": "ubuntu-latest",
                    "java_version": "17",
                    "node_version": "22",
                    "android_api_level": "35",
                    "ndk_version": "27.1.12297006",
                    "gradle_executable": "./gradlew",
                    "cache_key_suffix": "prod"
                },
                {
                    "name": "Minimum Supported",
                    "os": "ubuntu-latest",
                    "java_version": "11",
                    "node_version": "18",
                    "android_api_level": "33",
                    "ndk_version": "25.2.9519653",
                    "gradle_executable": "./gradlew",
                    "cache_key_suffix": "min"
                },
                {
                    "name": "Latest Stable",
                    "os": "ubuntu-latest",
                    "java_version": "21",
                    "node_version": "22",
                    "android_api_level": "35",
                    "ndk_version": "27.1.12297006",
                    "gradle_executable": "./gradlew",
                    "cache_key_suffix": "latest"
                }
            ]
        }'
    else
        MATRIX='{
            "include": [
                {
                    "name": "Production Linux",
                    "os": "ubuntu-latest",
                    "java_version": "17",
                    "node_version": "22",
                    "android_api_level": "35",
                    "ndk_version": "27.1.12297006",
                    "gradle_executable": "./gradlew",
                    "cache_key_suffix": "prod-linux"
                }
            ]
        }'
    fi
    
    # Test JSON validation
    if echo "$MATRIX" | python -m json.tool > /dev/null 2>&1; then
        echo "✅ Matrix JSON is valid for $matrix_type"
        CONFIGS=$(echo "$MATRIX" | python -c "import sys, json; data=json.load(sys.stdin); print(len(data['include']))")
        echo "   📊 Generated $CONFIGS configuration(s)"
    else
        echo "❌ Matrix JSON is invalid for $matrix_type"
        return 1
    fi
}

# Test all matrix types
echo ""
test_matrix_generation "production"
echo ""
test_matrix_generation "compatibility" 
echo ""
test_matrix_generation "full"

echo ""
echo "🎯 All matrix generation tests completed!"
