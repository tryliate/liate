<?php

require_once __DIR__ . '/LiateAgent.php';

use Liate\ADK\LiateAgent;

echo "🚀 Running REAL LIVE MCP Agent in PHP...\n";

$agent = new LiateAgent([
    'L' => 'sarvam/sarvam-105b',
    'I' => ['memory' => 'session_php_live'],
    'A' => [
        'name' => 'Time Agent',
        'intent' => 'Fetch live real-time clock for any timezone'
    ],
    'T' => [
        'time' => [
            'command' => 'uvx',
            'args' => ['mcp-server-time']
        ]
    ],
    'E' => [
        'SARVAM_API_KEY' => getenv('SARVAM_API_KEY') ?: ''
    ]
]);

$response = $agent->run("What is the exact live current time in Mumbai right now? Use your real-time tool.");

echo "\n--- LIVE REAL AGENT OUTPUT (PHP) ---\n";
echo $response . "\n";
