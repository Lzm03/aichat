import React, { useState } from 'react';
import { LibraryView } from '../components/workshop/LibraryView';
import { CreationFlow } from '../components/workshop/CreationFlow';

export const AiBotWorkshopPage: React.FC = () => {
  const [view, setView] = useState<'library' | 'creation'>('library');
  const [editingBotId, setEditingBotId] = useState<string | null>(null);

  const handleStartCreation = () => {
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

  return (
    <div className="transition-all duration-500">
      {view === 'library' && <LibraryView onStartCreation={handleStartCreation} onEditBot={handleEditBot} />}
      {view === 'creation' && <CreationFlow onBack={handleBackToLibrary} botId={editingBotId} />}
    </div>
  );
};
