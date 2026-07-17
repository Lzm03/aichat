import React, { useEffect, useRef, useState } from 'react';
import { LibraryView } from '../components/workshop/LibraryView';
import { CreationFlow } from '../components/workshop/CreationFlow';
import { useFeatureEntitlements } from '../hooks/useFeatureEntitlements';
import { usePlatformDialog } from '../hooks/usePlatformDialog';
import { PlatformDialog } from '../components/system/PlatformDialog';
import {
  consumeTrialEndedPopupPending,
  TRIAL_ENDED_POPUP_MESSAGE,
  TRIAL_ENDED_POPUP_TITLE,
} from '../utils/trial-popup';

type AiBotWorkshopPageProps = {
  searchQuery?: string;
};

export const AiBotWorkshopPage: React.FC<AiBotWorkshopPageProps> = ({ searchQuery = '' }) => {
  const { features, loading, initialized, refresh, consume } = useFeatureEntitlements();
  const { dialog, closeDialog, showAlert } = usePlatformDialog();
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
      title: TRIAL_ENDED_POPUP_TITLE,
      message: TRIAL_ENDED_POPUP_MESSAGE,
      confirmText: '我知道了',
    });
  }, [botPublishFeature?.locked, chatMessagesFeature?.locked, showAlert]);

  useEffect(() => {
    if (!consumeTrialEndedPopupPending()) return;
    if (trialEndedDialogShownRef.current) return;
    trialEndedDialogShownRef.current = true;
    showAlert({
      title: TRIAL_ENDED_POPUP_TITLE,
      message: TRIAL_ENDED_POPUP_MESSAGE,
      confirmText: '我知道了',
    });
  }, [showAlert]);

  const handleStartCreation = () => {
    if (!initialized || loading || !botPublishFeature) {
      return;
    }
    if (botPublishFeature?.locked) {
      showAlert({
        title: '創建角色已用完',
        message: TRIAL_ENDED_POPUP_MESSAGE,
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
