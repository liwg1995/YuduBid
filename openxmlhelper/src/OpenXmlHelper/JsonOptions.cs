using System.Text.Encodings.Web;
using System.Text.Json;

namespace Yibiao.OpenXmlHelper;

/// <summary>统一 JSON 序列化：信号紧凑，任务文件可读。</summary>
static class JsonOptions
{
    public static readonly JsonSerializerOptions Signal = Create(writeIndented: false);
    public static readonly JsonSerializerOptions File = Create(writeIndented: true);

    static JsonSerializerOptions Create(bool writeIndented)
    {
        return new JsonSerializerOptions
        {
            PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
            PropertyNameCaseInsensitive = true,
            WriteIndented = writeIndented,
            Encoder = JavaScriptEncoder.UnsafeRelaxedJsonEscaping,
        };
    }
}
