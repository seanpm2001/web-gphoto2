import { h, Component, createRef } from 'preact';
import { rethrowIfCritical } from './ops.js';

export const isDebug = new URLSearchParams(location.search).has('debug');

const Stats = isDebug
  ? await import('stats.js').then(
      res => /** @type {typeof import('stats.js')} */ (res['default'])
    )
  : null;

/** @extends Component<{ getPreview?: () => Promise<Blob> }, { error?: string }> */
export class Preview extends Component {
  canvasHolderRef = createRef();
  canvasRef = createRef();
  /** @type {ResizeObserver} */
  resizeObserver;
  stats = isDebug ? new Stats() : null;

  render() {
    return h(
      'div',
      { class: 'center-parent', ref: this.canvasHolderRef },
      !this.props.getPreview
        ? h('div', { class: 'center' }, `Preview is unsupported`)
        : h('canvas', { class: 'center', ref: this.canvasRef })
    );
  }

  async componentDidMount() {
    if (!this.props.getPreview) return;

    let canvas = /** @type {HTMLCanvasElement} */ (this.canvasRef.current);
    let canvasHolder = this.canvasHolderRef.current;

    if (isDebug) {
      canvasHolder.appendChild(this.stats.dom);
    }

    let canvasCtx = canvas.getContext('bitmaprenderer');

    let ratio = 0;

    let throttled = 0;
    function updateCanvasSize() {
      if (throttled) {
        cancelAnimationFrame(throttled);
      }
      throttled = requestAnimationFrame(() => {
        throttled = 0;

        let width = canvasHolder.offsetWidth - 10;
        let height = canvasHolder.offsetHeight;

        if (height * ratio > width) {
          height = width / ratio;
        } else {
          width = height * ratio;
        }

        Object.assign(canvas, { width, height });
      });
    }
    (this.resizeObserver = new ResizeObserver(updateCanvasSize)).observe(
      canvasHolder
    );

    // I have no idea why, but if we connect too soon, it just hangs...
    await new Promise(resolve => setTimeout(resolve, 1000));

    while (this.canvasRef.current) {
      try {
        let blob = await this.props.getPreview();

        // If ratio is known; decode resized image right away - it's a bit faster.
        // If it isn't known, retrieve entire image to calculate ratio from its dimensions.
        let img = await createImageBitmap(
          blob,
          ratio
            ? {
                resizeWidth: canvas.width,
                resizeHeight: canvas.height
              }
            : {}
        );
        if (!ratio) {
          ratio = img.width / img.height;
          updateCanvasSize();
        }
        await new Promise(resolve => requestAnimationFrame(resolve));
        canvasCtx.transferFromImageBitmap(img);
      } catch (err) {
        rethrowIfCritical(err);
        console.error('Could not refresh preview:', err);
      }
      this.stats?.update();
    }
  }

  componentWillUnmount() {
    this.resizeObserver?.disconnect();
  }
}
