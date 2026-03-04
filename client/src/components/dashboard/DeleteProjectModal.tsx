interface DeleteProjectModalProps {
  open: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}

export default function DeleteProjectModal({ open, onCancel, onConfirm }: DeleteProjectModalProps) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm transition-opacity"
        onClick={onCancel}
      ></div>
      <div className="relative bg-white dark:bg-[#1e1e2e] rounded-3xl p-8 max-w-md w-full shadow-2xl border border-slate-200 dark:border-white/10 transform transition-all scale-100 opacity-100">
        <div className="w-16 h-16 bg-red-100 dark:bg-red-500/10 rounded-full flex items-center justify-center mx-auto mb-6">
          <span className="material-symbols-rounded text-3xl text-red-500">delete_forever</span>
        </div>

        <h3 className="text-2xl font-bold text-center mb-2 text-slate-900 dark:text-white">Delete Project?</h3>
        <p className="text-center text-slate-500 dark:text-slate-400 mb-8">
          Are you sure you want to delete this project? This action cannot be undone and all data will be lost.
        </p>

        <div className="flex gap-4">
          <button
            onClick={onCancel}
            className="flex-1 px-6 py-3 rounded-xl font-semibold bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            className="flex-1 px-6 py-3 rounded-xl font-semibold bg-red-500 hover:bg-red-600 text-white shadow-lg shadow-red-500/30 transition-all hover:scale-[1.02] active:scale-[0.98]"
          >
            Delete
          </button>
        </div>
      </div>
    </div>
  );
}
