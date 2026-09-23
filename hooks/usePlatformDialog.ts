import { useCallback, useState } from "react";

type DialogTone = "info" | "danger";

type DialogState = {
  open: boolean;
  title: string;
  message: string;
  /** Optional one-entry-per-row detail lines (e.g. a new account's email and
   * temporary password). Rendered as a scrollable list so that a long list
   * cannot grow the dialog past the viewport and hide its buttons. */
  details?: string[];
  confirmText: string;
  cancelText?: string;
  tone: DialogTone;
  onConfirm?: (() => void) | null;
};

const initialState: DialogState = {
  open: false,
  title: "",
  message: "",
  details: undefined,
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
      details,
      confirmText = "知道了",
      tone = "info",
    }: {
      title: string;
      message: string;
      details?: string[];
      confirmText?: string;
      tone?: DialogTone;
    }) => {
      setDialog({
        open: true,
        title,
        message,
        details,
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
      details,
      confirmText = "確認",
      cancelText = "取消",
      tone = "info",
      onConfirm,
    }: {
      title: string;
      message: string;
      details?: string[];
      confirmText?: string;
      cancelText?: string;
      tone?: DialogTone;
      onConfirm: () => void;
    }) => {
      setDialog({
        open: true,
        title,
        message,
        // Always set, even when undefined: otherwise a confirm opened after an
        // alert would keep showing that alert's detail list.
        details,
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
