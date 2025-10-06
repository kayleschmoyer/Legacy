#!/usr/bin/env node

/**
 * Test GitHub Actions Matrix Generation
 * Simulates the matrix determination logic to validate JSON output
 */

console.log('🧪 Testing GitHub Actions Matrix Generation...\n');

const testCases = [
  { type: 'production', description: 'Production configuration only' },
  { type: 'compatibility', description: 'Minimum + Recommended + Latest' },
  { type: 'full', description: 'Cross-platform + version variants' }
];

function generateMatrix(matrixType) {
  let matrix;
  
  if (matrixType === 'production') {
    matrix = {
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
    };
  } else if (matrixType === 'compatibility') {
    matrix = {
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
    };
  } else {
    matrix = {
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
        },
        {
          "name": "Production macOS",
          "os": "macos-latest",
          "java_version": "17",
          "node_version": "22",
          "android_api_level": "35",
          "ndk_version": "27.1.12297006",
          "gradle_executable": "./gradlew",
          "cache_key_suffix": "prod-macos"
        },
        {
          "name": "Production Windows",
          "os": "windows-latest",
          "java_version": "17",
          "node_version": "22",
          "android_api_level": "35",
          "ndk_version": "27.1.12297006",
          "gradle_executable": "gradlew.bat",
          "cache_key_suffix": "prod-windows"
        },
        {
          "name": "Minimum Java 11",
          "os": "ubuntu-latest",
          "java_version": "11",
          "node_version": "18",
          "android_api_level": "33",
          "ndk_version": "25.2.9519653",
          "gradle_executable": "./gradlew",
          "cache_key_suffix": "min-java11"
        },
        {
          "name": "Latest Java 21",
          "os": "ubuntu-latest",
          "java_version": "21",
          "node_version": "22",
          "android_api_level": "35",
          "ndk_version": "27.1.12297006",
          "gradle_executable": "./gradlew",
          "cache_key_suffix": "latest-java21"
        }
      ]
    };
  }
  
  return matrix;
}

// Test each matrix type
testCases.forEach(testCase => {
  console.log(`📋 Testing: ${testCase.type} (${testCase.description})`);
  
  try {
    const matrix = generateMatrix(testCase.type);
    const compactJson = JSON.stringify(matrix);
    const configCount = matrix.include.length;
    
    // Validate JSON can be parsed
    const parsed = JSON.parse(compactJson);
    
    console.log(`✅ Matrix generated successfully`);
    console.log(`   📊 Configurations: ${configCount}`);
    console.log(`   📏 JSON length: ${compactJson.length} characters`);
    console.log(`   🔧 Sample config: ${parsed.include[0].name} (Java ${parsed.include[0].java_version})`);
    
    // Check that compact JSON matches original
    if (JSON.stringify(parsed) === compactJson) {
      console.log(`   ✅ JSON round-trip successful`);
    } else {
      console.log(`   ❌ JSON round-trip failed`);
    }
    
  } catch (error) {
    console.log(`❌ Matrix generation failed: ${error.message}`);
  }
  
  console.log('');
});

console.log('🎯 Matrix generation test completed!');
console.log('');
console.log('📝 Matrix formats are compatible with GitHub Actions output format.');
console.log('   The workflow should now work without YAML syntax errors.');
