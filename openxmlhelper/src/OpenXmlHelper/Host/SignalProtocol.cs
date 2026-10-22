using System.Text.Json;
using System.Text.Json.Serialization;

namespace Yibiao.OpenXmlHelper.Host;

/// <summary>管道上的开工 / 做完信号。</summary>
sealed class SignalMessage
{
    [JsonPropertyName("v")]
    public int V { get; set; }

    [JsonPropertyName("type")]
    public string Type { get; set; } = "";

    [JsonPropertyName("job")]
    public string Job { get; set; } = "";

    [JsonPropertyName("ok")]
    public bool? Ok { get; set; }
}

/// <summary>解析和写出一行信号。</summary>
static class SignalProtocol
{
    public const int Version = 1;
    public const string TypeRun = "run";
    public const string TypeDone = "done";

    public static bool TryParse(string line, out SignalMessage signal)
    {
        signal = new SignalMessage();
        try
        {
            var parsed = JsonSerializer.Deserialize<SignalMessage>(line, JsonOptions.Signal);
            if (parsed is null || parsed.V != Version || string.IsNullOrWhiteSpace(parsed.Type))
            {
                return false;
            }

            signal = parsed;
            signal.Job = (parsed.Job ?? "").Trim();
            return true;
        }
        catch (JsonException)
        {
            return false;
        }
    }

    public static void WriteDone(string jobId, bool ok)
    {
        var json = JsonSerializer.Serialize(new SignalMessage
        {
            V = Version,
            Type = TypeDone,
            Job = jobId,
            Ok = ok,
        }, JsonOptions.Signal);
        Console.Out.Write(json);
        Console.Out.Write('\n');
        Console.Out.Flush();
    }
}
