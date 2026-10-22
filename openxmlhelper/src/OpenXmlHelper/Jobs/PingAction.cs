namespace Yibiao.OpenXmlHelper.Jobs;

/// <summary>回路探测：只回写成功结果。</summary>
static class PingAction
{
    public const string Name = "ping";

    public static JobResult Execute()
    {
        return JobResult.Success(Name);
    }
}
