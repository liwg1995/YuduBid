using System.Text;
using Yibiao.OpenXmlHelper.Jobs;

namespace Yibiao.OpenXmlHelper.Host;

/// <summary>按行读取 stdin，写出 stdout，驱动任务。</summary>
static class StdioLoop
{
    /// <summary>把控制台设成 UTF-8、无 BOM、换行只用 \n。</summary>
    public static void ConfigureUtf8()
    {
        var utf8 = new UTF8Encoding(encoderShouldEmitUTF8Identifier: false);
        Console.InputEncoding = utf8;
        Console.OutputEncoding = utf8;
        Console.SetIn(new StreamReader(Console.OpenStandardInput(), utf8, detectEncodingFromByteOrderMarks: false, bufferSize: 1024, leaveOpen: true));
        Console.SetOut(new StreamWriter(Console.OpenStandardOutput(), utf8, bufferSize: 1024, leaveOpen: true)
        {
            AutoFlush = true,
            NewLine = "\n",
        });
        Console.SetError(new StreamWriter(Console.OpenStandardError(), utf8, bufferSize: 1024, leaveOpen: true)
        {
            AutoFlush = true,
            NewLine = "\n",
        });
    }

    /// <summary>循环处理 run 信号，直到 stdin 关闭。</summary>
    public static async Task RunAsync(JobRunner runner, CancellationToken cancellationToken = default)
    {
        while (!cancellationToken.IsCancellationRequested)
        {
            var line = await Console.In.ReadLineAsync(cancellationToken).ConfigureAwait(false);
            if (line is null)
            {
                break;
            }

            if (string.IsNullOrWhiteSpace(line))
            {
                continue;
            }

            if (!SignalProtocol.TryParse(line, out var signal))
            {
                Console.Error.WriteLine("无法解析信号");
                continue;
            }

            if (!string.Equals(signal.Type, SignalProtocol.TypeRun, StringComparison.Ordinal))
            {
                Console.Error.WriteLine($"忽略信号类型：{signal.Type}");
                continue;
            }

            if (!JobFolder.IsValidJobId(signal.Job))
            {
                Console.Error.WriteLine("任务编号不合法");
                if (!string.IsNullOrWhiteSpace(signal.Job))
                {
                    SignalProtocol.WriteDone(signal.Job, false);
                }

                continue;
            }

            var ok = runner.Run(signal.Job);
            SignalProtocol.WriteDone(signal.Job, ok);
        }
    }
}
