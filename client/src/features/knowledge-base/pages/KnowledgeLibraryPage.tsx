import { useState } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import KnowledgeBasePage from './KnowledgeBasePage';
import ImageKnowledgeBasePage from './ImageKnowledgeBasePage';
import '../knowledgeBase.css';

type KnowledgeLibraryType = 'document' | 'image';

interface KnowledgeLibraryPageProps {
  initialType?: KnowledgeLibraryType;
}

export default function KnowledgeLibraryPage({ initialType = 'document' }: KnowledgeLibraryPageProps) {
  const [activeType, setActiveType] = useState<KnowledgeLibraryType>(initialType);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [createRequest, setCreateRequest] = useState({ type: initialType, key: 0 });

  const createKnowledgeBase = (type: KnowledgeLibraryType) => {
    setActiveType(type);
    setCreateRequest((current) => ({ type, key: current.key + 1 }));
    setCreateDialogOpen(false);
  };

  return (
    <div className="knowledge-library-shell">
      <header className="knowledge-library-header">
        <div>
          <h1>知识库</h1>
          <p>统一管理可检索的文档资料与可复用的本地图片素材。</p>
        </div>
        <div className="knowledge-library-header-actions">
          <div className="knowledge-library-tabs" role="tablist" aria-label="知识库类型">
            <button type="button" role="tab" aria-selected={activeType === 'document'} className={activeType === 'document' ? 'is-active' : ''} onClick={() => setActiveType('document')}>文档资料</button>
            <button type="button" role="tab" aria-selected={activeType === 'image'} className={activeType === 'image' ? 'is-active' : ''} onClick={() => setActiveType('image')}>图片素材</button>
          </div>
          <button type="button" className="primary-action" onClick={() => setCreateDialogOpen(true)}>创建知识库</button>
        </div>
      </header>

      <div className="knowledge-library-content">
        <div className="knowledge-library-pane" hidden={activeType !== 'document'}>
          <KnowledgeBasePage embedded createRequestKey={createRequest.type === 'document' ? createRequest.key : 0} />
        </div>
        <div className="knowledge-library-pane" hidden={activeType !== 'image'}>
          <ImageKnowledgeBasePage embedded createRequestKey={createRequest.type === 'image' ? createRequest.key : 0} />
        </div>
      </div>

      <Dialog.Root open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
        <Dialog.Portal>
          <Dialog.Overlay className="detail-help-modal" />
          <Dialog.Content className="detail-help-card knowledge-type-dialog">
            <header className="detail-help-head">
              <div><Dialog.Title>创建知识库</Dialog.Title><Dialog.Description>选择要创建的资料类型，后续可随时切换管理。</Dialog.Description></div>
              <Dialog.Close type="button" className="detail-help-close" aria-label="关闭">×</Dialog.Close>
            </header>
            <div className="knowledge-type-options">
              <button type="button" onClick={() => createKnowledgeBase('document')}>
                <span>DOC</span><strong>文档资料</strong><small>创建文件夹，上传 Word、PDF 或 Markdown 文档并提取知识条目。</small>
              </button>
              <button type="button" onClick={() => createKnowledgeBase('image')}>
                <span>IMG</span><strong>图片素材</strong><small>创建图片文件夹，管理方案插图、架构图及其他本地素材。</small>
              </button>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </div>
  );
}
