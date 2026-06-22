import { buildStructuredDescription, extractAdfText } from './adf';

describe('buildStructuredDescription', () => {
  it('returns undefined when all params are absent', () => {
    expect(buildStructuredDescription({})).toBeUndefined();
  });

  it('returns undefined when all params are empty strings', () => {
    expect(
      buildStructuredDescription({
        description: '',
        context: '',
        risk: '',
        planningNotes: '',
      }),
    ).toBeUndefined();
  });

  it('wraps plain text in a single paragraph', () => {
    const result = buildStructuredDescription({
      description: 'Simple description.',
    });
    expect(result).toEqual({
      type: 'doc',
      version: 1,
      content: [
        {
          type: 'paragraph',
          content: [{ type: 'text', text: 'Simple description.' }],
        },
      ],
    });
  });

  it('converts **bold** text to strong marks', () => {
    const result = buildStructuredDescription({
      description: 'This is **bold** text.',
    });
    const para = (result!.content as unknown[])[0] as {
      content: unknown[];
    };
    expect(para.content).toEqual([
      { type: 'text', text: 'This is ' },
      { type: 'text', text: 'bold', marks: [{ type: 'strong' }] },
      { type: 'text', text: ' text.' },
    ]);
  });

  it('converts *italic* text to em marks', () => {
    const result = buildStructuredDescription({
      description: 'This is *italic* text.',
    });
    const para = (result!.content as unknown[])[0] as {
      content: unknown[];
    };
    expect(para.content).toEqual([
      { type: 'text', text: 'This is ' },
      { type: 'text', text: 'italic', marks: [{ type: 'em' }] },
      { type: 'text', text: ' text.' },
    ]);
  });

  it('converts `inline code` to code marks', () => {
    const result = buildStructuredDescription({
      description: 'Call `doThing()` to proceed.',
    });
    const para = (result!.content as unknown[])[0] as {
      content: unknown[];
    };
    expect(para.content).toEqual([
      { type: 'text', text: 'Call ' },
      { type: 'text', text: 'doThing()', marks: [{ type: 'code' }] },
      { type: 'text', text: ' to proceed.' },
    ]);
  });

  it('converts a bullet list into a bulletList ADF node', () => {
    const result = buildStructuredDescription({
      description: '- Item one\n- Item two\n- Item three',
    });
    expect(result!.content).toEqual([
      {
        type: 'bulletList',
        content: [
          {
            type: 'listItem',
            content: [
              {
                type: 'paragraph',
                content: [{ type: 'text', text: 'Item one' }],
              },
            ],
          },
          {
            type: 'listItem',
            content: [
              {
                type: 'paragraph',
                content: [{ type: 'text', text: 'Item two' }],
              },
            ],
          },
          {
            type: 'listItem',
            content: [
              {
                type: 'paragraph',
                content: [{ type: 'text', text: 'Item three' }],
              },
            ],
          },
        ],
      },
    ]);
  });

  it('converts a numbered list into an orderedList ADF node', () => {
    const result = buildStructuredDescription({
      description: '1. First\n2. Second\n3. Third',
    });
    expect(result!.content).toEqual([
      {
        type: 'orderedList',
        content: [
          {
            type: 'listItem',
            content: [
              {
                type: 'paragraph',
                content: [{ type: 'text', text: 'First' }],
              },
            ],
          },
          {
            type: 'listItem',
            content: [
              {
                type: 'paragraph',
                content: [{ type: 'text', text: 'Second' }],
              },
            ],
          },
          {
            type: 'listItem',
            content: [
              {
                type: 'paragraph',
                content: [{ type: 'text', text: 'Third' }],
              },
            ],
          },
        ],
      },
    ]);
  });

  it('converts a fenced code block into a codeBlock ADF node', () => {
    const result = buildStructuredDescription({
      description: '```typescript\nconst x = 1;\n```',
    });
    expect(result!.content).toEqual([
      {
        type: 'codeBlock',
        attrs: { language: 'typescript' },
        content: [{ type: 'text', text: 'const x = 1;' }],
      },
    ]);
  });

  it('converts a fenced code block without language', () => {
    const result = buildStructuredDescription({
      description: '```\nsome code\n```',
    });
    const block = (result!.content as unknown[])[0] as {
      type: string;
      attrs: Record<string, unknown>;
    };
    expect(block.type).toBe('codeBlock');
    expect(block.attrs).toEqual({});
  });

  it('converts ATX headings into heading ADF nodes', () => {
    const result = buildStructuredDescription({
      description: '## Section Title',
    });
    expect(result!.content).toEqual([
      {
        type: 'heading',
        attrs: { level: 2 },
        content: [{ type: 'text', text: 'Section Title' }],
      },
    ]);
  });

  it('splits blank-line-separated text into multiple paragraphs', () => {
    const result = buildStructuredDescription({
      description: 'First paragraph.\n\nSecond paragraph.',
    });
    expect(result!.content).toHaveLength(2);
    const [p1, p2] = result!.content as Array<{ content: unknown[] }>;
    expect(p1.content).toEqual([{ type: 'text', text: 'First paragraph.' }]);
    expect(p2.content).toEqual([{ type: 'text', text: 'Second paragraph.' }]);
  });

  it('handles mixed content: paragraph + bullet list', () => {
    const result = buildStructuredDescription({
      description: 'Intro paragraph.\n\n- Alpha\n- Beta',
    });
    expect(result!.content).toHaveLength(2);
    const [para, list] = result!.content as Array<{ type: string }>;
    expect(para.type).toBe('paragraph');
    expect(list.type).toBe('bulletList');
  });

  it('appends structured fields as headed sections', () => {
    const result = buildStructuredDescription({
      description: 'Main description.',
      context: 'Why this matters.',
      risk: 'Low risk.',
      planningNotes: 'See file.ts.',
    });

    const content = result!.content as Array<{
      type: string;
      attrs?: { level: number };
      content?: Array<{ type: string; text?: string }>;
    }>;

    // [para, h2:Context, para, h2:Risk Assessment, para, h2:Planning Notes, para]
    expect(content[0].type).toBe('paragraph');
    expect(content[1]).toEqual({
      type: 'heading',
      attrs: { level: 2 },
      content: [{ type: 'text', text: 'Context' }],
    });
    expect(content[3]).toEqual({
      type: 'heading',
      attrs: { level: 2 },
      content: [{ type: 'text', text: 'Risk Assessment' }],
    });
    expect(content[5]).toEqual({
      type: 'heading',
      attrs: { level: 2 },
      content: [{ type: 'text', text: 'Planning Notes' }],
    });
  });

  it('only description provided — no extra headings appended', () => {
    const result = buildStructuredDescription({ description: 'Only this.' });
    const content = result!.content as Array<{ type: string }>;
    expect(content.every((n) => n.type !== 'heading')).toBe(true);
  });

  it('structured fields with Markdown are also parsed', () => {
    const result = buildStructuredDescription({
      context: '- Reason A\n- Reason B',
    });
    const content = result!.content as Array<{ type: string }>;
    // heading + bulletList
    expect(content[0].type).toBe('heading');
    expect(content[1].type).toBe('bulletList');
  });
});

describe('extractAdfText', () => {
  it('returns empty string for non-ADF input', () => {
    expect(extractAdfText(null)).toBe('');
    expect(extractAdfText(undefined)).toBe('');
    expect(extractAdfText('string')).toBe('');
  });

  it('extracts text from a simple paragraph ADF', () => {
    const adf = {
      type: 'doc',
      version: 1,
      content: [
        {
          type: 'paragraph',
          content: [{ type: 'text', text: 'Hello world.' }],
        },
      ],
    };
    expect(extractAdfText(adf)).toBe('Hello world.');
  });

  it('extracts text from ADF with bullet list nodes', () => {
    const adf = buildStructuredDescription({
      description: '- Item A\n- Item B',
    });
    const text = extractAdfText(adf);
    expect(text).toContain('Item A');
    expect(text).toContain('Item B');
  });

  it('extracts text from ADF with code block', () => {
    const adf = buildStructuredDescription({
      description: '```\nconst x = 1;\n```',
    });
    expect(extractAdfText(adf)).toContain('const x = 1;');
  });
});
