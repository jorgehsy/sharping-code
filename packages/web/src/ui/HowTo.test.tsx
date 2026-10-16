// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { HowTo, STEPS } from './HowTo.tsx';

// jsdom has no media playback.
beforeAll(() => {
  HTMLMediaElement.prototype.play = () => Promise.resolve();
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const video = (c: HTMLElement) => c.querySelector('video')!;
const selected = () => screen.getAllByRole('tab').findIndex((t) => t.getAttribute('aria-selected') === 'true');

describe('HowTo', () => {
  it('starts on the first step and switches clip and text when a tab is clicked', () => {
    const { container } = render(<HowTo />);
    expect(selected()).toBe(0);
    expect(video(container).getAttribute('src')).toBe(STEPS[0].video);

    fireEvent.click(screen.getByRole('tab', { name: /Condimentos/ }));
    expect(selected()).toBe(2);
    expect(video(container).getAttribute('src')).toBe(STEPS[2].video);
    expect(screen.getByRole('tabpanel').textContent).toContain(STEPS[2].title);
  });

  it('moves to the next step when a clip ends, wrapping after the last one', () => {
    const { container } = render(<HowTo />);
    act(() => void fireEvent.ended(video(container)));
    expect(selected()).toBe(1);
    act(() => void fireEvent.ended(video(container)));
    act(() => void fireEvent.ended(video(container)));
    expect(selected()).toBe(0);
  });

  it('pauses on click (no moving on while paused) and resumes on the button', () => {
    const { container } = render(<HowTo />);
    const pause = vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => {});
    fireEvent.click(video(container));
    expect(pause).toHaveBeenCalled();
    const button = screen.getByRole('button', { name: 'Reanudar video' });
    fireEvent.click(button);
    expect(screen.getByRole('button', { name: 'Pausar video' })).toBeTruthy();
  });

  it('a tab click resumes playback', () => {
    render(<HowTo />);
    vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => {});
    fireEvent.click(screen.getByRole('button', { name: 'Pausar video' }));
    fireEvent.click(screen.getByRole('tab', { name: /Código/ }));
    expect(selected()).toBe(1);
    expect(screen.getByRole('button', { name: 'Pausar video' })).toBeTruthy();
  });

  it('shows a placeholder instead of a broken player when a clip is missing', () => {
    const { container } = render(<HowTo />);
    act(() => void fireEvent.error(video(container)));
    expect(container.querySelector('video')).toBeNull();
    expect(container.querySelector('.howto-missing')?.textContent).toBe('1');
  });
});
