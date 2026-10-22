using DocumentFormat.OpenXml;
using Wp = DocumentFormat.OpenXml.Wordprocessing;

namespace Yibiao.OpenXmlHelper.Jobs;

/// <summary>将已确认候选确定性转换为带业务标识的 Word 内容控件。</summary>
static class TemplateFieldSdtWriter
{
    public const string TagPrefix = "yibiao:field:";
    public const string PlaceholderFill = "FCE8E6";
    public const string PlaceholderTextColor = "000000";

    public static void Apply(TemplateFieldCandidate candidate, TemplateFieldDefinition field, int wordId)
    {
        if (candidate.Target is Wp.SdtRun existing)
        {
            UpdateExistingControl(existing, field, wordId);
            return;
        }

        if (candidate.Target is Wp.SdtBlock existingBlock)
        {
            UpdateExistingBlockControl(existingBlock, field, wordId);
            return;
        }

        if (candidate.Target is not Wp.Paragraph paragraph)
        {
            throw new InvalidOperationException($"候选位置已失效：{candidate.CandidateId}");
        }

        ReplaceParagraphRange(paragraph, candidate.Start, candidate.Length, field, wordId);
    }

    static void UpdateExistingControl(Wp.SdtRun control, TemplateFieldDefinition field, int wordId)
    {
        var properties = control.SdtProperties ?? control.PrependChild(new Wp.SdtProperties());
        properties.RemoveAllChildren<Wp.SdtAlias>();
        properties.RemoveAllChildren<Wp.SdtId>();
        properties.RemoveAllChildren<Wp.Tag>();
        properties.AddChild(new Wp.SdtAlias { Val = field.Name }, throwOnError: true);
        properties.AddChild(new Wp.SdtId { Val = wordId }, throwOnError: true);
        properties.AddChild(new Wp.Tag { Val = $"{TagPrefix}{field.Id}" }, throwOnError: true);

        var content = control.SdtContentRun ?? control.AppendChild(new Wp.SdtContentRun());
        var sourceRun = content.Elements<Wp.Run>().FirstOrDefault();
        content.RemoveAllChildren();
        content.AppendChild(CreatePlaceholderRun(field, sourceRun));
    }

    static void UpdateExistingBlockControl(Wp.SdtBlock control, TemplateFieldDefinition field, int wordId)
    {
        var properties = control.SdtProperties ?? control.PrependChild(new Wp.SdtProperties());
        properties.RemoveAllChildren<Wp.SdtAlias>();
        properties.RemoveAllChildren<Wp.SdtId>();
        properties.RemoveAllChildren<Wp.Tag>();
        properties.AddChild(new Wp.SdtAlias { Val = field.Name }, throwOnError: true);
        properties.AddChild(new Wp.SdtId { Val = wordId }, throwOnError: true);
        properties.AddChild(new Wp.Tag { Val = $"{TagPrefix}{field.Id}" }, throwOnError: true);

        var content = control.SdtContentBlock ?? control.AppendChild(new Wp.SdtContentBlock());
        var sourceParagraph = content.Elements<Wp.Paragraph>().FirstOrDefault();
        var sourceRun = sourceParagraph?.Descendants<Wp.Run>().FirstOrDefault();
        var paragraph = new Wp.Paragraph();
        if (sourceParagraph?.ParagraphProperties is not null)
        {
            paragraph.AppendChild((Wp.ParagraphProperties)sourceParagraph.ParagraphProperties.CloneNode(true));
        }
        paragraph.AppendChild(CreatePlaceholderRun(field, sourceRun));
        content.RemoveAllChildren();
        content.AppendChild(paragraph);
    }

    static void ReplaceParagraphRange(
        Wp.Paragraph paragraph,
        int start,
        int length,
        TemplateFieldDefinition field,
        int wordId)
    {
        var runs = paragraph.Elements<Wp.Run>().ToList();
        var runTexts = runs.Select(ReadRunText).ToList();
        var totalLength = runTexts.Sum(item => item.Length);
        if (start < 0 || length < 0 || start + length > totalLength)
        {
            throw new InvalidOperationException($"模板字段位置已漂移：{field.Name}");
        }

        var control = CreateControl(field, wordId, FindStyleRun(runs, runTexts, start));
        if (runs.Count == 0)
        {
            if (start != 0 || length != 0) throw new InvalidOperationException($"模板字段位置已漂移：{field.Name}");
            paragraph.AppendChild(control);
            return;
        }

        if (length == 0)
        {
            InsertAt(paragraph, runs, runTexts, start, control);
            return;
        }

        var end = start + length;
        var firstIndex = FindRunIndex(runTexts, start, preferNextAtBoundary: true);
        var lastIndex = FindRunIndex(runTexts, end, preferNextAtBoundary: false);
        if (firstIndex < 0 || lastIndex < firstIndex)
        {
            throw new InvalidOperationException($"模板字段位置已漂移：{field.Name}");
        }

        var firstStart = runTexts.Take(firstIndex).Sum(item => item.Length);
        var lastStart = runTexts.Take(lastIndex).Sum(item => item.Length);
        var prefix = runTexts[firstIndex][..(start - firstStart)];
        var suffix = runTexts[lastIndex][(end - lastStart)..];
        var firstRun = runs[firstIndex];
        var lastRun = runs[lastIndex];

        if (prefix.Length > 0) firstRun.InsertBeforeSelf(CreateTextRun(prefix, firstRun));
        firstRun.InsertBeforeSelf(control);
        if (suffix.Length > 0) firstRun.InsertBeforeSelf(CreateTextRun(suffix, lastRun));
        for (var index = firstIndex; index <= lastIndex; index += 1)
        {
            runs[index].Remove();
        }
    }

    static void InsertAt(
        Wp.Paragraph paragraph,
        IReadOnlyList<Wp.Run> runs,
        IReadOnlyList<string> runTexts,
        int start,
        Wp.SdtRun control)
    {
        var totalLength = runTexts.Sum(item => item.Length);
        if (start == totalLength)
        {
            runs[^1].InsertAfterSelf(control);
            return;
        }

        var runIndex = FindRunIndex(runTexts, start, preferNextAtBoundary: true);
        if (runIndex < 0)
        {
            paragraph.AppendChild(control);
            return;
        }

        var runStart = runTexts.Take(runIndex).Sum(item => item.Length);
        var offset = start - runStart;
        var run = runs[runIndex];
        var text = runTexts[runIndex];
        if (offset == 0)
        {
            run.InsertBeforeSelf(control);
            return;
        }

        var prefix = text[..offset];
        var suffix = text[offset..];
        if (prefix.Length > 0) run.InsertBeforeSelf(CreateTextRun(prefix, run));
        run.InsertBeforeSelf(control);
        if (suffix.Length > 0) run.InsertBeforeSelf(CreateTextRun(suffix, run));
        run.Remove();
    }

    static int FindRunIndex(IReadOnlyList<string> runTexts, int offset, bool preferNextAtBoundary)
    {
        var cursor = 0;
        for (var index = 0; index < runTexts.Count; index += 1)
        {
            var next = cursor + runTexts[index].Length;
            if (offset < next || (!preferNextAtBoundary && offset == next && runTexts[index].Length > 0))
            {
                return index;
            }
            cursor = next;
        }
        return -1;
    }

    static Wp.Run? FindStyleRun(IReadOnlyList<Wp.Run> runs, IReadOnlyList<string> runTexts, int start)
    {
        if (runs.Count == 0) return null;
        var index = FindRunIndex(runTexts, start, preferNextAtBoundary: true);
        return index >= 0 ? runs[index] : runs[^1];
    }

    static Wp.SdtRun CreateControl(TemplateFieldDefinition field, int wordId, Wp.Run? sourceRun)
    {
        var properties = new Wp.SdtProperties(
            new Wp.SdtAlias { Val = field.Name },
            new Wp.SdtId { Val = wordId },
            new Wp.Tag { Val = $"{TagPrefix}{field.Id}" });
        var content = new Wp.SdtContentRun(CreatePlaceholderRun(field, sourceRun));
        return new Wp.SdtRun(properties, content);
    }

    static Wp.Run CreatePlaceholderRun(TemplateFieldDefinition field, Wp.Run? sourceRun)
    {
        var properties = sourceRun?.RunProperties is null
            ? new Wp.RunProperties()
            : (Wp.RunProperties)sourceRun.RunProperties.CloneNode(true);
        properties.RemoveAllChildren<Wp.Color>();
        properties.RemoveAllChildren<Wp.Shading>();
        properties.AddChild(new Wp.Color { Val = PlaceholderTextColor }, throwOnError: true);
        properties.AddChild(
            new Wp.Shading
            {
                Val = Wp.ShadingPatternValues.Clear,
                Color = "auto",
                Fill = PlaceholderFill,
            },
            throwOnError: true);
        var prefix = field.FillBy == "manual" ? "人工处理" : "待填写";
        return new Wp.Run(
            properties,
            new Wp.Text($"【{prefix}：{field.Name}】") { Space = SpaceProcessingModeValues.Preserve });
    }

    static Wp.Run CreateTextRun(string text, Wp.Run sourceRun)
    {
        var run = new Wp.Run();
        if (sourceRun.RunProperties is not null)
        {
            run.AppendChild((Wp.RunProperties)sourceRun.RunProperties.CloneNode(true));
        }
        run.AppendChild(new Wp.Text(text) { Space = SpaceProcessingModeValues.Preserve });
        return run;
    }

    static string ReadRunText(Wp.Run run)
    {
        return string.Concat(run.Elements<Wp.Text>().Select(item => item.Text));
    }
}
