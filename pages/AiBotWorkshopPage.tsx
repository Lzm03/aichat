import React, { useEffect, useRef, useState } from 'react';
import { LibraryView } from '../components/workshop/LibraryView';
import { CreationFlow } from '../components/workshop/CreationFlow';
import { useFeatureEntitlements } from '../hooks/useFeatureEntitlements';
import { usePlatformDialog } from '../hooks/usePlatformDialog';
import { PlatformDialog } from '../components/system/PlatformDialog';
import {
  consumeTrialEndedPopupPending,
  getTrialEndedPopupCopy,
} from '../utils/trial-popup';
import { useTeacherLang, type TeacherLang } from '../utils/teacherI18n';

const WORKSHOP_T: Record<TeacherLang, Record<string, string>> = {
  "zh-HK": { gotIt: "我知道了", charactersUsedUp: "創建角色已用完" },
  en: { gotIt: "Got it", charactersUsedUp: "Persona quota used up" },
};

type AiBotWorkshopPageProps = {
  searchQuery?: string;
};

export const AiBotWorkshopPage: React.FC<AiBotWorkshopPageProps> = ({ searchQuery = '' }) => {
  const { features, loading, initialized, refresh, consume } = useFeatureEntitlements();
  const { dialog, closeDialog, showAlert } = usePlatformDialog();
  const wt = WORKSHOP_T[useTeacherLang()];
  const [view, setView] = useState<'library' | 'creation'>('library');
  const [editingBotId, setEditingBotId] = useState<string | null>(null);
  const botPublishFeature = features.find((item) => item.key === 'bot_publish');
  const chatMessagesFeature = features.find((item) => item.key === 'chat_messages');
  const trialEndedDialogShownRef = useRef(false);

  useEffect(() => {
    const isTrialFullyUsed = Boolean(botPublishFeature?.locked && chatMessagesFeature?.locked);
    if (!isTrialFullyUsed) {
      trialEndedDialogShownRef.current = false;
      return;
    }
    if (trialEndedDialogShownRef.current) return;

    trialEndedDialogShownRef.current = true;
    showAlert({
      ...getTrialEndedPopupCopy(),
      confirmText: wt.gotIt,
    });
  }, [botPublishFeature?.locked, chatMessagesFeature?.locked, showAlert, wt]);

  useEffect(() => {
    if (!consumeTrialEndedPopupPending()) return;
    if (trialEndedDialogShownRef.current) return;
    trialEndedDialogShownRef.current = true;
    showAlert({
      ...getTrialEndedPopupCopy(),
      confirmText: wt.gotIt,
    });
  }, [showAlert, wt]);

  const handleStartCreation = () => {
    if (!initialized || loading || !botPublishFeature) {
      return;
    }
    if (botPublishFeature?.locked) {
      showAlert({
        title: wt.charactersUsedUp,
        message: getTrialEndedPopupCopy().message,
      });
      return;
    }
    setEditingBotId(null);
    setView('creation');
  };
  
  const handleEditBot = (botId: string) => {
    setEditingBotId(botId);
    setView('creation');
  };

  const handleBackToLibrary = () => {
    setView('library');
    setEditingBotId(null);
  };

  useEffect(() => {
    if (typeof document === 'undefined') return;
    document.body.dataset.demoNoticeContext = view;
    return () => {
      delete document.body.dataset.demoNoticeContext;
    };
  }, [view]);

  return (
    <div className="transition-all duration-500">
      {view === 'library' && (
        <LibraryView
          onStartCreation={handleStartCreation}
          onEditBot={handleEditBot}
          onDeleteBot={() => {}}
          createBotFeature={botPublishFeature}
          chatMessagesFeature={chatMessagesFeature}
          featureLoading={!initialized || loading || !botPublishFeature}
          searchQuery={searchQuery}
        />
      )}
      {view === 'creation' && (
        <CreationFlow
          onBack={handleBackToLibrary}
          botId={editingBotId}
          featureEntitlements={features}
          refreshFeatureEntitlements={refresh}
          consumeFeature={consume}
        />
      )}
      <PlatformDialog
        open={dialog.open}
        title={dialog.title}
        message={dialog.message}
        confirmText={dialog.confirmText}
        cancelText={dialog.cancelText}
        tone={dialog.tone}
        onClose={closeDialog}
        onConfirm={dialog.onConfirm || undefined}
      />
    </div>
  );
};
