import { useCallback, useState } from "react";

type DialogTone = "info" | "danger";

type DialogState = {
  open: boolean;
  title: string;
  message: string;
  confirmText: string;
  cancelText?: string;
  tone: DialogTone;
  onConfirm?: (() => void) | null;
};

const initialState: DialogState = {
  open: false,
  title: "",
  message: "",
  confirmText: "知道了",
  tone: "info",
  onConfirm: null,
};

export function usePlatformDialog() {
  const [dialog, setDialog] = useState<DialogState>(initialState);

  const closeDialog = useCallback(() => {
    setDialog((prev) => ({ ...prev, open: false, onConfirm: null }));
  }, []);

  const showAlert = useCallback(
    ({
      title,
      message,
      confirmText = "知道了",
      tone = "info",
    }: {
      title: string;
      message: string;
      confirmText?: string;
      tone?: DialogTone;
    }) => {
      setDialog({
        open: true,
        title,
        message,
        confirmText,
        tone,
        cancelText: undefined,
        onConfirm: null,
      });
    },
    []
  );

  const showConfirm = useCallback(
    ({
      title,
      message,
      confirmText = "確認",
      cancelText = "取消",
      tone = "info",
      onConfirm,
    }: {
      title: string;
      message: string;
      confirmText?: string;
      cancelText?: string;
      tone?: DialogTone;
      onConfirm: () => void;
    }) => {
      setDialog({
        open: true,
        title,
        message,
        confirmText,
        cancelText,
        tone,
        onConfirm: () => {
          onConfirm();
          closeDialog();
        },
      });
    },
    [closeDialog]
  );

  return {
    dialog,
    closeDialog,
    showAlert,
    showConfirm,
  };
}
