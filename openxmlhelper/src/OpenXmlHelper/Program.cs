using Yibiao.OpenXmlHelper.Host;
using Yibiao.OpenXmlHelper.Jobs;

var workspace = ParseWorkspace(args);
if (string.IsNullOrWhiteSpace(workspace) || !Directory.Exists(workspace))
{
    Console.Error.WriteLine("缺少有效的 --workspace 目录");
    return 1;
}

StdioLoop.ConfigureUtf8();
var runner = new JobRunner(Path.GetFullPath(workspace));
await StdioLoop.RunAsync(runner);
return 0;

/// <summary>解析 --workspace 参数。</summary>
static string? ParseWorkspace(string[] arguments)
{
    for (var index = 0; index < arguments.Length; index += 1)
    {
        if (arguments[index] == "--workspace" && index + 1 < arguments.Length)
        {
            return arguments[index + 1].Trim();
        }
    }

    return null;
}
