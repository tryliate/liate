package liate

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"strings"
)

type ToolServer struct {
	Command string   `json:"command,omitempty"`
	Args    []string `json:"args,omitempty"`
	Url     string   `json:"url,omitempty"`
	Tools   []string `json:"tools,omitempty"`
}

type Action struct {
	Name   string `json:"name"`
	Intent string `json:"intent,omitempty"`
	Skills string `json:"skills,omitempty"`
}

type Identity struct {
	Memory string `json:"memory,omitempty"`
	Name   string `json:"name,omitempty"`
}

type Pillars struct {
	L string                 `json:"L"`
	I interface{}            `json:"I,omitempty"`
	A interface{}            `json:"A,omitempty"`
	T map[string]ToolServer  `json:"T,omitempty"`
	E map[string]string      `json:"E,omitempty"`
}

type Agent struct {
	Spec     Pillars
	Endpoint string
	ApiKey   string
}

func NewAgent(spec Pillars, customEndpoint ...string) *Agent {
	ep := "http://localhost:7071"
	if len(customEndpoint) > 0 && customEndpoint[0] != "" {
		ep = customEndpoint[0]
	} else if envEp := os.Getenv("LIATE_ENDPOINT"); envEp != "" {
		ep = envEp
	} else if envEp := os.Getenv("LIATE_BASE_URL"); envEp != "" {
		ep = envEp
	}
	apiKey := os.Getenv("LIATE_API_KEY")
	return &Agent{Spec: spec, Endpoint: ep, ApiKey: apiKey}
}

func Om(spec Pillars, customEndpoint ...string) *Agent {
	return NewAgent(spec, customEndpoint...)
}

func (a *Agent) WithApiKey(key string) *Agent {
	a.ApiKey = key
	return a
}

func (a *Agent) Run(prompt string) (string, error) {
	payload, err := json.Marshal(map[string]interface{}{
		"spec":   a.Spec,
		"prompt": prompt,
	})
	if err != nil {
		return "", err
	}

	agentName := "default"
	if act, ok := a.Spec.A.(Action); ok && act.Name != "" {
		agentName = act.Name
	} else if actMap, ok := a.Spec.A.(map[string]interface{}); ok {
		if n, ok := actMap["name"].(string); ok && n != "" {
			agentName = n
		}
	}

	url := fmt.Sprintf("%s/lapi/v1/%s/run", strings.TrimRight(a.Endpoint, "/"), agentName)
	req, err := http.NewRequest("POST", url, bytes.NewBuffer(payload))
	if err != nil {
		return "", err
	}

	req.Header.Set("Content-Type", "application/json")
	if a.ApiKey != "" {
		req.Header.Set("Authorization", fmt.Sprintf("Bearer %s", a.ApiKey))
	}

	client := &http.Client{}
	resp, err := client.Do(req)
	if err != nil {
		// Fallback to /api/agent/run if /lapi/v1 was not reachable
		fallbackUrl := fmt.Sprintf("%s/api/agent/run", strings.TrimRight(a.Endpoint, "/"))
		reqFallback, fallbackErr := http.NewRequest("POST", fallbackUrl, bytes.NewBuffer(payload))
		if fallbackErr == nil {
			reqFallback.Header.Set("Content-Type", "application/json")
			if a.ApiKey != "" {
				reqFallback.Header.Set("Authorization", fmt.Sprintf("Bearer %s", a.ApiKey))
			}
			resp, err = client.Do(reqFallback)
		}
		if err != nil {
			return "", err
		}
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return "", err
	}

	if resp.StatusCode >= 400 {
		return "", fmt.Errorf("[Liate ADK Error %d]: %s", resp.StatusCode, string(body))
	}

	var data map[string]interface{}
	if err := json.Unmarshal(body, &data); err == nil {
		if out, ok := data["response"].(string); ok {
			return out, nil
		}
		if out, ok := data["output"].(string); ok {
			return out, nil
		}
		if out, ok := data["result"].(string); ok {
			return out, nil
		}
	}
	return string(body), nil
}
