// 正文配图可用的画面风格。旧项目中的 engineering_diagram 保持兼容。
const AI_IMAGE_STYLES = {
  engineering_diagram: { label: '工程示意图', hint: '画面采用工程项目图示风格，结构清晰、专业克制，适合投标技术方案插图。' },
  realistic_photo: { label: '写实摄影', hint: '画面采用专业写实摄影风格，真实材质与自然光线，构图克制。' },
  product_shot: { label: '设备特写', hint: '画面采用设备产品特写摄影风格，主体突出，部件细节清晰。' },
  architectural_render: { label: '建筑场地效果图', hint: '画面采用建筑与场地可视化效果图风格，空间尺度清晰，光影自然。' },
  '3d_render': { label: '三维模型', hint: '画面采用简洁的三维模型渲染风格，体块与部件关系清楚。' },
  isometric_illustration: { label: '轴测插画', hint: '画面采用等轴测工程插画风格，空间与分区关系清晰。' },
  cutaway_illustration: { label: '剖视插画', hint: '画面采用剖切透视技术插画风格，展示内部构造与连接关系。' },
  exploded_view: { label: '爆炸分解图', hint: '画面采用爆炸分解图风格，沿装配方向有序展示部件。' },
  line_drawing: { label: '技术线稿', hint: '画面采用规整的单色技术线稿风格，突出结构与操作要点。' },
  flat_illustration: { label: '扁平插画', hint: '画面采用克制的扁平矢量插画风格，主题关系清晰。' },
};

function buildImageStylePrompt(prompt, style) {
  const hint = AI_IMAGE_STYLES[style]?.hint || '';
  return `${prompt}\n\n${hint ? `${hint}\n` : ''}避免出现品牌标识、水印、夸张营销元素和无关文字。`;
}

module.exports = { AI_IMAGE_STYLES, buildImageStylePrompt };
