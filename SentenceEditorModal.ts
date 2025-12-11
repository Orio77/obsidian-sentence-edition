import {
	App,
	Modal,
	TextAreaComponent,
	ButtonComponent,
	Notice,
	Editor,
} from "obsidian";
import { SentenceManager, SentenceData } from "./SentenceManager";

export class SentenceEditorModal extends Modal {
	private sentenceData: SentenceData;
	private editor: Editor;
	private textArea: TextAreaComponent;
	private currentText: string;
	private onNavigate: (direction: "next" | "previous") => void;
	private versionsContainer: HTMLElement;
	private leftIndicator: HTMLElement;
	private rightIndicator: HTMLElement;

	constructor(
		app: App,
		editor: Editor,
		sentenceData: SentenceData,
		onNavigate: (direction: "next" | "previous") => void
	) {
		super(app);
		this.editor = editor;
		this.sentenceData = sentenceData;
		this.currentText = sentenceData.text; // Keeps track of what is "saved" or "current" relative to the file
		this.onNavigate = onNavigate;
	}

	onOpen() {
		const { contentEl } = this;
		this.modalEl.addClass("sentence-editor-modal-container");
		contentEl.addClass("sentence-editor-modal");

		// Header
		contentEl.createEl("h2", { text: "Edit Sentence" });

		// Main Layout Wrapper
		const layout = contentEl.createDiv("sentence-editor-layout");

		// --- Comparison Wrapper (Holds Editor + Reference) ---
		// We want these side-by-side on desktop
		const comparisonWrapper = layout.createDiv(
			"sentence-editor-comparison-wrapper"
		);

		// 1. Text Editor (Left/Top) - "New Version"
		const textContainer = comparisonWrapper.createDiv(
			"sentence-editor-text-container"
		);
		textContainer.createEl("h4", { text: "New Version" });
		this.textArea = new TextAreaComponent(textContainer);
		this.textArea
			.setValue("") // Start empty
			.setPlaceholder(this.sentenceData.text) // Show original as placeholder
			.onChange((value) => {
				// Tracking logic if needed
			});

		// Make it large
		this.textArea.inputEl.rows = 5;
		this.textArea.inputEl.style.width = "100%";
		this.textArea.inputEl.style.height = "100%"; // Fill container

		// 2. Reference View (Right/Bottom) - "Latest Previous / Original"
		const referenceContainer = comparisonWrapper.createDiv(
			"sentence-editor-reference-container"
		);
		referenceContainer.createEl("h4", { text: "Original / Current" });
		const referenceText = referenceContainer.createDiv(
			"sentence-editor-reference-text"
		);
		referenceText.setText(this.sentenceData.text);

		// --- Versions List (Below) ---
		// "List of previous versions to still be, but not on main view"
		this.versionsContainer = layout.createDiv("sentence-editor-versions");
		this.renderVersions();

		// Buttons
		const buttonContainer = contentEl.createDiv("sentence-editor-buttons");

		new ButtonComponent(buttonContainer).setButtonText("Cancel").onClick(() => {
			this.close();
		});

		new ButtonComponent(buttonContainer)
			.setButtonText("Save")
			.setCta()
			.onClick(() => {
				this.save();
			});

		// Swipe Handling
		this.setupSwipeGestures(contentEl);
	}

	renderVersions() {
		this.versionsContainer.empty();

		// Use a details element to collapse the versions list by default?
		// Or just a header that toggles?
		// "not on main view since it's not immediatelly important"
		const details = this.versionsContainer.createEl("details");
		const summary = details.createEl("summary", {
			text: "Show Older Versions",
		});
		details.appendChild(summary);

		const listContainer = details.createDiv("sentence-versions-list");

		if (this.sentenceData.versions.length === 0) {
			listContainer.createDiv({ text: "No older versions." });
		}

		// Show versions in reverse order (newest first)
		[...this.sentenceData.versions].reverse().forEach((ver) => {
			const verEl = listContainer.createDiv("sentence-version-item");
			verEl.setText(ver);
			verEl.addEventListener("click", () => {
				this.restoreVersion(ver);
			});
		});
	}

	restoreVersion(text: string) {
		const currentDraft = this.textArea.getValue();
		if (currentDraft && currentDraft.trim() !== "") {
			// Save current draft to versions if it's new
			if (!this.sentenceData.versions.includes(currentDraft)) {
				this.sentenceData.versions.push(currentDraft);
				// Re-render versions to show the stashed draft
				this.renderVersions();
			}
		}

		this.textArea.setValue(text);
		new Notice("Restored version");
	}

	save() {
		const newContent = this.textArea.getValue();

		if (newContent && newContent !== "") {
			SentenceManager.updateSentence(
				this.editor,
				this.sentenceData,
				newContent
			);
		}
		this.close();
	}

	setupSwipeGestures(element: HTMLElement) {
		let touchStartX = 0;
		// let touchEndX = 0; // Not needed if we track continuously
		const minSwipeDistance = 50;

		// Visual Indicators
		this.leftIndicator = element.createDiv("swipe-indicator left");
		this.leftIndicator.setText("Next >");
		this.rightIndicator = element.createDiv("swipe-indicator right");
		this.rightIndicator.setText("< Prev");

		const updateIndicators = (currentX: number) => {
			const diff = currentX - touchStartX;
			// Dragging Right -> Previous (Positive diff)
			// Dragging Left -> Next (Negative diff)

			if (diff > 0) {
				// Show Right Indicator (Previous) - Wait, logic inversion in CSS names?
				// "Swipe Right" means finger moves Left->Right. Content moves Right. Previous appears on Left?
				// Usually: Swipe Right (->) goes to Previous page (which is on the left).
				// My CSS: .swipe-indicator.left is on the left.

				// Let's map:
				// Diff > 0 (Right swipe) -> Previous.
				// Visual: We want to see on the LEFT side that we are going back.
				this.leftIndicator.style.opacity = Math.min(diff / 150, 1).toString();
				this.rightIndicator.style.opacity = "0";
				this.leftIndicator.setText("Previous");
			} else {
				// Diff < 0 (Left swipe) -> Next.
				// Visual: We want to see on the RIGHT side that we are going forward.
				this.rightIndicator.style.opacity = Math.min(
					Math.abs(diff) / 150,
					1
				).toString();
				this.leftIndicator.style.opacity = "0";
				this.rightIndicator.setText("Next");
			}
		};

		element.addEventListener(
			"touchstart",
			(e) => {
				touchStartX = e.changedTouches[0].screenX;
			},
			{ passive: true }
		);

		element.addEventListener(
			"touchmove",
			(e) => {
				updateIndicators(e.changedTouches[0].screenX);
			},
			{ passive: true }
		);

		element.addEventListener(
			"touchend",
			(e) => {
				const touchEndX = e.changedTouches[0].screenX;
				const diff = touchEndX - touchStartX;

				// Reset indicators
				this.leftIndicator.style.opacity = "0";
				this.rightIndicator.style.opacity = "0";

				if (diff < -minSwipeDistance) {
					// Swipe Left -> Next Sentence
					this.navigateToNext();
				} else if (diff > minSwipeDistance) {
					// Swipe Right -> Previous Sentence
					this.navigateToPrevious();
				}
			},
			{ passive: true }
		);
	}

	navigateToNext() {
		this.autoSaveDraft();
		this.close();
		this.onNavigate("next");
	}

	navigateToPrevious() {
		this.autoSaveDraft();
		this.close();
		this.onNavigate("previous");
	}

	autoSaveDraft() {
		// If the user typed something but swiped away, do we save it?
		// Requirement: "save temporarely whatever is in the text editor... later either the new version... or will be deleted"
		// This applied to "restore a previous version".
		// For swiping, we probably want to commit changes if they typed something?

		const newVal = this.textArea.getValue();
		if (newVal && newVal !== "") {
			// If we swipe, we probably mean to "Save & Next"
			SentenceManager.updateSentence(this.editor, this.sentenceData, newVal);
			new Notice("Saved changes");
		}
	}

	onClose() {
		const { contentEl } = this;
		contentEl.empty();
	}
}
