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
      <div className="relative w-full max-w-md transform rounded-3xl border border-slate-800 bg-slate-900 p-8 opacity-100 shadow-2xl transition-all scale-100">
        <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-red-500/10">
          <span className="material-symbols-rounded text-3xl text-red-400">delete_forever</span>
        </div>

        <h3 className="mb-2 text-center text-2xl font-bold text-white">Delete Project?</h3>
        <p className="mb-8 text-center text-slate-400">
          Are you sure you want to delete this project? This action cannot be undone and all data will be lost.
        </p>

        <div className="flex gap-4">
          <button
            onClick={onCancel}
            className="flex-1 rounded-xl border border-slate-700 bg-slate-800 px-6 py-3 font-semibold text-slate-200 transition-colors hover:bg-slate-700"
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
