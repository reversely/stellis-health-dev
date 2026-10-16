import {
  $createParagraphNode, $getSelection, $isRangeSelection, createEditor,
  COMMAND_PRIORITY_EDITOR, FORMAT_TEXT_COMMAND, REDO_COMMAND, UNDO_COMMAND,
} from 'lexical';
import {$createHeadingNode, HeadingNode, QuoteNode, registerRichText} from '@lexical/rich-text';
import {
  INSERT_CHECK_LIST_COMMAND, INSERT_ORDERED_LIST_COMMAND, INSERT_UNORDERED_LIST_COMMAND,
  ListItemNode, ListNode, registerCheckList, registerList,
} from '@lexical/list';
import {$toggleLink, AutoLinkNode, LinkNode, TOGGLE_LINK_COMMAND} from '@lexical/link';
import {createEmptyHistoryState, registerHistory} from '@lexical/history';
import {$setBlocksType} from '@lexical/selection';
import {
  $convertFromMarkdownString, $convertToMarkdownString,
  BOLD_ITALIC_STAR, BOLD_STAR, CHECK_LIST, HEADING, ITALIC_STAR, LINK,
  ORDERED_LIST, UNORDERED_LIST, registerMarkdownShortcuts,
} from '@lexical/markdown';

const MARKDOWN = [HEADING, UNORDERED_LIST, ORDERED_LIST, CHECK_LIST,
  BOLD_ITALIC_STAR, BOLD_STAR, ITALIC_STAR, LINK];

export function createNotesEditor(root, toolbar, onChange, onError) {
  const editor = createEditor({
    namespace: 'StellisNotes',
    nodes: [HeadingNode, QuoteNode, ListNode, ListItemNode, LinkNode, AutoLinkNode],
    theme: {heading: {h1: 'note-heading-one', h2: 'note-heading-two'},
      list: {ul: 'note-bullets', ol: 'note-numbers', listitem: 'note-list-item',
        listitemChecked: 'note-check-done', listitemUnchecked: 'note-check-open'},
      text: {bold: 'note-bold', italic: 'note-italic'}},
    onError(error) { onError(error); },
  });
  const unregister = [registerRichText(editor), registerList(editor), registerCheckList(editor),
    editor.registerCommand(TOGGLE_LINK_COMMAND, payload => {$toggleLink(payload); return true;}, COMMAND_PRIORITY_EDITOR),
    registerHistory(editor, createEmptyHistoryState(), 300),
    registerMarkdownShortcuts(editor, MARKDOWN)];
  root.contentEditable = 'true';
  root.setAttribute('role', 'textbox');
  root.setAttribute('aria-multiline', 'true');
  editor.setRootElement(root);
  unregister.push(editor.registerUpdateListener(({editorState, dirtyElements, dirtyLeaves, tags}) => {
    if (tags.has('notes-load') || (!dirtyElements.size && !dirtyLeaves.size)) return;
    editorState.read(() => onChange($convertToMarkdownString(MARKDOWN)));
  }));

  toolbar.addEventListener('mousedown', event => {
    if (event.target.closest('button')) event.preventDefault();
  });
  toolbar.addEventListener('click', event => {
    const action = event.target.closest('button')?.dataset.noteAction;
    if (!action) return;
    if (action === 'bold' || action === 'italic') editor.dispatchCommand(FORMAT_TEXT_COMMAND, action);
    else if (action === 'bullets') editor.dispatchCommand(INSERT_UNORDERED_LIST_COMMAND, undefined);
    else if (action === 'numbers') editor.dispatchCommand(INSERT_ORDERED_LIST_COMMAND, undefined);
    else if (action === 'checklist') editor.dispatchCommand(INSERT_CHECK_LIST_COMMAND, undefined);
    else if (action === 'undo') editor.dispatchCommand(UNDO_COMMAND, undefined);
    else if (action === 'redo') editor.dispatchCommand(REDO_COMMAND, undefined);
    else if (action === 'heading' || action === 'paragraph') editor.update(() => {
      const selection = $getSelection();
      if ($isRangeSelection(selection))
        $setBlocksType(selection, () => action === 'heading' ? $createHeadingNode('h2') : $createParagraphNode());
    });
    else if (action === 'link') {
      const answer = window.prompt('Link URL');
      if (!answer) return;
      try {
        const url = new URL(answer);
        if (!['https:', 'http:', 'mailto:'].includes(url.protocol)) throw new Error('Unsupported link');
        editor.dispatchCommand(TOGGLE_LINK_COMMAND, url.href);
      } catch {onError(new Error('Enter a valid link URL.'));}
    }
    editor.focus();
  });

  return {
    setMarkdown(markdown) {
      editor.update(() => $convertFromMarkdownString(markdown || '', MARKDOWN), {tag: 'notes-load'});
    },
    getMarkdown() {
      let markdown = '';
      editor.getEditorState().read(() => { markdown = $convertToMarkdownString(MARKDOWN); });
      return markdown;
    },
    focus() { editor.focus(); },
    destroy() { for (const release of unregister) release(); editor.setRootElement(null); },
  };
}
