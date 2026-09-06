package main

import (
	"fmt"
	"os"

	"github.com/tryliate/agentantra/adk/go"
)

func main() {
	// ⚡ 5-Line Sovereign Agent with REAL-TIME MCP Tool in Go
	agent := liate.Om(liate.Pillars{
		L: "sarvam/sarvam-105b",
		I: liate.Identity{Memory: "session_go_live"},
		A: liate.Action{Name: "Time Agent", Intent: "Fetch live real-time clock for any timezone"},
		T: map[string]liate.ToolServer{
			"time": {
				Command: "uvx",
				Args:    []string{"mcp-server-time"},
			},
		},
		E: map[string]string{"SARVAM_API_KEY": os.Getenv("SARVAM_API_KEY")},
	})

	fmt.Println("🚀 Running REAL LIVE MCP Agent in Go...")
	res, err := agent.Run("What is the exact live current time in Mumbai right now? Use your real-time tool.")
	if err != nil {
		panic(err)
	}
	fmt.Println("\n--- LIVE REAL AGENT OUTPUT (GO) ---")
	fmt.Println(res)
}

