using System;
using System.Collections.Generic;
using System.Threading.Tasks;
using Liate.ADK;

class Program
{
    static async Task Main(string[] args)
    {
        Console.WriteLine("🚀 Running REAL LIVE MCP Agent in C# / .NET...");

        var agent = new LiateAgent(new Pillars
        {
            L = "sarvam/sarvam-105b",
            I = new IdentitySpec { Memory = "session_csharp_live" },
            A = new ActionSpec 
            { 
                Name = "Time Agent", 
                Intent = "Fetch live real-time clock for any timezone" 
            },
            T = new Dictionary<string, ToolServer>
            {
                ["time"] = new ToolServer 
                { 
                    Command = "uvx", 
                    Args = new List<string> { "mcp-server-time" } 
                }
            },
            E = new Dictionary<string, string>
            {
                ["SARVAM_API_KEY"] = Environment.GetEnvironmentVariable("SARVAM_API_KEY") ?? ""
            }
        });

        string response = await agent.RunAsync("What is the exact live current time in Mumbai right now? Use your real-time tool.");
        Console.WriteLine("\n--- LIVE REAL AGENT OUTPUT (C#) ---");
        Console.WriteLine(response);
    }
}
