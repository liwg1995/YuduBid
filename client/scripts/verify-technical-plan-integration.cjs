const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { EventEmitter } = require('node:events');
const { Document, Footer, Header, Packer, PageBreak, Paragraph } = require('docx');
const { createSqliteDatabase } = require('../electron/services/sqliteDatabase.cjs');
const { createTechnicalPlanStore } = require('../electron/services/technicalPlanStore.cjs');
const { runBidSectionExtractionTask } = require('../electron/services/bidSectionExtractionTask.cjs');
const { selectBidSectionMarkdown } = require('../electron/services/bidSectionSelection.cjs');
const { checkWordLayout } = require('../electron/services/wordLayoutAudit.cjs');
const { normalizeWordCount, resolveSectionWordTarget, wordBudgetGuidance } = require('../electron/services/generationWordBudget.cjs');

async function main() {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'yibiao-technical-plan-acceptance-'));
  const app = Object.assign(new EventEmitter(), { getPath: () => directory });
  const database = createSqliteDatabase(app);
  try {
    const store = createTechnicalPlanStore({ app, db: database.db });
    const lines = [
      '# 招标文件',
      '通用投标须知：各标段均需遵守。',
      '投标保证金按通用条款执行。',
      '## 采购范围',
      '一标段：道路工程。',
      '一标段施工范围包括路面与排水。',
      '二标段：桥梁工程。',
      '二标段施工范围包括桥面与支座。',
      '## 技术评分',
      '一标段评分要求：道路施工组织。',
      '二标段评分要求：桥梁施工组织。',
      '通用质量要求：执行现行标准。',
    ];
    store.importTenderMarkdown({ fileName: '合成多标段招标文件.md', markdown: lines.join('\n') });
    const updates = [];
    await runBidSectionExtractionTask({
      workspaceStore: store,
      aiService: { collectJsonResponse: async ({ messages }) => {
        assert.match(messages[1].content, /L000010/);
        return { sections: [
          { title: '一标段', includeRanges: [{ startLine: 5, endLine: 6 }, { startLine: 10, endLine: 10 }], evidence: [lines[4], lines[9]] },
          { title: '二标段', includeRanges: [{ startLine: 7, endLine: 8 }, { startLine: 11, endLine: 11 }], evidence: [lines[6], lines[10]] },
        ] };
      } },
      updateTask: (task) => updates.push(task),
    });
    const extracted = store.loadTechnicalPlan();
    assert.equal(extracted.bidSectionSource, 'evidence');
    assert.equal(extracted.bidSections.length, 2);
    assert.equal(updates.at(-1).status, 'success');

    store.saveSelectedBidSection(extracted.bidSections[0].id);
    const firstLot = store.readTenderMarkdownForGeneration();
    assert.match(firstLot, /通用投标须知/);
    assert.match(firstLot, /一标段评分要求/);
    assert.doesNotMatch(firstLot, /二标段施工范围|二标段评分要求/);

    store.saveSelectedBidSection(extracted.bidSections[1].id);
    const secondLot = store.readTenderMarkdownForGeneration();
    assert.match(secondLot, /通用质量要求/);
    assert.match(secondLot, /二标段评分要求/);
    assert.doesNotMatch(secondLot, /一标段施工范围|一标段评分要求/);
    const sharedLine = selectBidSectionMarkdown('一标段独有\n两标段共用\n二标段独有', 'a', [
      { id: 'a', title: '一标段', includeRanges: [{ startLine: 1, endLine: 2 }] },
      { id: 'b', title: '二标段', includeRanges: [{ startLine: 2, endLine: 3 }] },
    ]);
    assert.match(sharedLine, /两标段共用/);
    assert.doesNotMatch(sharedLine, /二标段独有/);

    assert.equal(normalizeWordCount('1200.6'), 1201);
    assert.equal(resolveSectionWordTarget(0, 12000, 8), 1500);
    assert.match(wordBudgetGuidance({ minimumWords: 8000, maximumWords: 12000, sectionWords: 1500 }), /12000/);

    const filePath = path.join(directory, '页眉页脚空白页-验收.docx');
    const document = new Document({ sections: [{
      headers: { default: new Header({ children: [new Paragraph('项目名称')] }) },
      footers: { default: new Footer({ children: [new Paragraph('页码')] }) },
      children: [
        new Paragraph(`第一页正文 ${'技术说明'.repeat(60)}`),
        new Paragraph({ children: [new PageBreak()] }),
        new Paragraph({ children: [new PageBreak()] }),
        new Paragraph(`第三页正文 ${'实施方案'.repeat(60)}`),
      ],
    }] });
    await fs.writeFile(filePath, await Packer.toBuffer(document));
    const audit = await checkWordLayout(filePath);
    assert.equal(audit.pageCount, 3);
    assert(audit.issues.some((issue) => issue.page === 2 && issue.code === 'blank-page'));
    assert(!audit.issues.some((issue) => issue.page === 1 && issue.code === 'blank-page'));
    console.log('多标段提取、切换、篇幅规则和 Word 分页自检验收通过');
  } finally {
    database.close();
    await fs.rm(directory, { recursive: true, force: true });
  }
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
