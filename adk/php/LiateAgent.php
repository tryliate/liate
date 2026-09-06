<?php

namespace Liate\ADK;

class LiateAgent
{
    private array $spec;
    private string $endpoint;
    private ?string $apiKey;

    public function __construct(
        array $spec,
        ?string $endpoint = null,
        ?string $apiKey = null
    ) {
        $this->spec = $spec;
        $this->endpoint = $endpoint 
            ?? getenv('LIATE_ENDPOINT') 
            ?: (getenv('LIATE_BASE_URL') ?: 'http://localhost:7071');
        $this->apiKey = $apiKey ?? getenv('LIATE_API_KEY') ?: null;
    }

    public function run(string $prompt): string
    {
        $payload = json_encode([
            'spec' => $this->spec,
            'prompt' => $prompt
        ]);

        $agentName = $this->spec['A']['name'] ?? 'default';
        $base = rtrim($this->endpoint, '/');
        $url = "{$base}/lapi/v1/{$agentName}/run";

        $headers = ['Content-Type: application/json'];
        if ($this->apiKey) {
            $headers[] = "Authorization: Bearer {$this->apiKey}";
        }

        $ch = curl_init($url);
        curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
        curl_setopt($ch, CURLOPT_POST, true);
        curl_setopt($ch, CURLOPT_POSTFIELDS, $payload);
        curl_setopt($ch, CURLOPT_HTTPHEADER, $headers);
        curl_setopt($ch, CURLOPT_TIMEOUT, 60);

        $response = curl_exec($ch);
        $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);

        if ($httpCode >= 400 || $response === false) {
            // Fallback to /api/agent/run
            $fallbackUrl = "{$base}/api/agent/run";
            curl_setopt($ch, CURLOPT_URL, $fallbackUrl);
            $response = curl_exec($ch);
            $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        }

        curl_close($ch);

        if ($httpCode >= 400) {
            throw new \RuntimeException("[Liate ADK Error {$httpCode}]: {$response}");
        }

        $data = json_decode($response, true);
        if (is_array($data)) {
            return $data['response'] ?? $data['output'] ?? $data['result'] ?? $response;
        }

        return (string) $response;
    }
}
