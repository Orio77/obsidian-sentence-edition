import { App, Editor, MarkdownView, Modal, Notice, Plugin } from "obsidian";
import { SentenceManager } from "./SentenceManager";
import { SentenceEditorModal } from "./SentenceEditorModal";

export default class SentenceEditionPlugin extends Plugin {
	async onload() {
		this.addCommand({
			id: "open-sentence-editor",
			name: "Edit current sentence",
			icon: "pencil",
			editorCallback: (editor: Editor, view: MarkdownView) => {
				this.openSentenceEditor(editor);
			},
		});

		this.addRibbonIcon("pencil", "Edit Sentence", (evt: MouseEvent) => {
			const view = this.app.workspace.getActiveViewOfType(MarkdownView);
			if (view) {
				this.openSentenceEditor(view.editor);
			}
		});
	}

	openSentenceEditor(editor: Editor) {
		const sentence = SentenceManager.getSentenceAtCursor(editor);
		if (!sentence) {
			new Notice("No sentence found at cursor.");
			return;
		}

		document.body.addClass("sentence-edition-blur-active");

		const modal = new SentenceEditorModal(
			this.app,
			editor,
			sentence,
			(direction) => {
				// Handle navigation

				// 1. Re-locate the sentence we just edited (it might have changed length)
				// We use the original start offset, which shouldn't have changed unless we edited BEFORE it (which we didn't)
				const currentSentenceStart = sentence.start;

				// Move cursor to start of current sentence to re-read it
				editor.setCursor(editor.offsetToPos(currentSentenceStart));
				const freshData = SentenceManager.getSentenceAtCursor(editor);

				if (!freshData) {
					document.body.removeClass("sentence-edition-blur-active");
					return;
				}

				let nextOffset: number | null = null;

				if (direction === "next") {
					// Calculate end of current sentence + versions
					const fullEnd =
						freshData.start + freshData.fullTextWithVersions.length;
					nextOffset = SentenceManager.getNextSentenceOffset(editor, fullEnd);
				} else {
					nextOffset = SentenceManager.getPreviousSentenceOffset(
						editor,
						freshData.start
					);
				}

				if (nextOffset !== null) {
					// Move cursor to the new sentence
					editor.setCursor(editor.offsetToPos(nextOffset));

					// Open editor again immediately
					// We keep the blur active by NOT removing it in onClose if we are navigating?
					// But onClose is called by modal.close().

					// Hack: The onClose below removes the class. We need to prevent that or re-add it.
					// Since we are in the callback passed to the modal, which is called AFTER close(),
					// the class has already been removed.
					// So we just add it back.

					this.openSentenceEditor(editor);
				} else {
					new Notice("No more sentences in that direction.");
					// Ensure blur is removed (it should be removed by onClose already)
					document.body.removeClass("sentence-edition-blur-active");
				}
			}
		);

		const originalOnClose = modal.onClose;
		modal.onClose = () => {
			document.body.removeClass("sentence-edition-blur-active");
			originalOnClose.call(modal);
		};

		modal.open();
	}

	onunload() {
		document.body.removeClass("sentence-edition-blur-active");
	}
}
