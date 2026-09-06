using System;
using System.Collections.Generic;
using System.Net.Http;
using System.Net.Http.Headers;
using System.Text;
using System.Text.Json;
using System.Text.Json.Serialization;
using System.Threading.Tasks;

namespace Liate.ADK
{
    public class ToolServer
    {
        [JsonPropertyName("command")]
        [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
        public string? Command { get; set; }

        [JsonPropertyName("args")]
        [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
        public List<string>? Args { get; set; }

        [JsonPropertyName("url")]
        [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
        public string? Url { get; set; }
    }

    public class ActionSpec
    {
        [JsonPropertyName("name")]
        public string Name { get; set; } = "default";

        [JsonPropertyName("intent")]
        [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
        public string? Intent { get; set; }

        [JsonPropertyName("skills")]
        [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
        public string? Skills { get; set; }
    }

    public class IdentitySpec
    {
        [JsonPropertyName("memory")]
        public string Memory { get; set; } = "session_csharp_live";
    }

    public class Pillars
    {
        [JsonPropertyName("L")]
        public string L { get; set; } = "sarvam/sarvam-105b";

        [JsonPropertyName("I")]
        public IdentitySpec I { get; set; } = new IdentitySpec();

        [JsonPropertyName("A")]
        public ActionSpec A { get; set; } = new ActionSpec();

        [JsonPropertyName("T")]
        [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
        public Dictionary<string, ToolServer>? T { get; set; }

        [JsonPropertyName("E")]
        [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
        public Dictionary<string, string>? E { get; set; }
    }

    public class LiateAgent
    {
        public Pillars Spec { get; set; }
        public string Endpoint { get; set; }
        public string? ApiKey { get; set; }

        private static readonly HttpClient _httpClient = new HttpClient();

        public LiateAgent(Pillars spec, string? endpoint = null, string? apiKey = null)
        {
            Spec = spec;
            Endpoint = endpoint 
                ?? Environment.GetEnvironmentVariable("LIATE_ENDPOINT") 
                ?? Environment.GetEnvironmentVariable("LIATE_BASE_URL") 
                ?? "http://localhost:7071";
            ApiKey = apiKey ?? Environment.GetEnvironmentVariable("LIATE_API_KEY");
        }

        public async Task<string> RunAsync(string prompt)
        {
            var payload = new
            {
                spec = Spec,
                prompt = prompt
            };

            string jsonString = JsonSerializer.Serialize(payload);
            string baseUri = Endpoint.TrimEnd('/');
            string url = $"{baseUri}/lapi/v1/{Spec.A.Name}/run";

            using var request = new HttpRequestMessage(HttpMethod.Post, url)
            {
                Content = new StringContent(jsonString, Encoding.UTF8, "application/json")
            };

            if (!string.IsNullOrEmpty(ApiKey))
            {
                request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", ApiKey);
            }

            HttpResponseMessage response;
            try
            {
                response = await _httpClient.SendAsync(request);
            }
            catch
            {
                // Fallback to legacy endpoint
                string fallbackUrl = $"{baseUri}/api/agent/run";
                using var fallbackRequest = new HttpRequestMessage(HttpMethod.Post, fallbackUrl)
                {
                    Content = new StringContent(jsonString, Encoding.UTF8, "application/json")
                };
                if (!string.IsNullOrEmpty(ApiKey))
                {
                    fallbackRequest.Headers.Authorization = new AuthenticationHeaderValue("Bearer", ApiKey);
                }
                response = await _httpClient.SendAsync(fallbackRequest);
            }

            string responseBody = await response.Content.ReadAsStringAsync();

            if (!response.IsSuccessStatusCode)
            {
                throw new Exception($"[Liate ADK Error {(int)response.StatusCode}]: {responseBody}");
            }

            try
            {
                using var doc = JsonDocument.Parse(responseBody);
                var root = doc.RootElement;
                if (root.TryGetProperty("response", out var respProp)) return respProp.GetString() ?? responseBody;
                if (root.TryGetProperty("output", out var outProp)) return outProp.GetString() ?? responseBody;
                if (root.TryGetProperty("result", out var resProp)) return resProp.GetString() ?? responseBody;
            }
            catch
            {
                // Fallback to raw string if not JSON
            }

            return responseBody;
        }
    }
}
