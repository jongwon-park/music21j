import * as $ from 'jquery';
import { common } from './common';

/**
 * module with tools for working with Streams. See {@link music21.streamInteraction} namespace.
 *
 * @exports music21/streamInteraction
 */
/**
 * Objects that work with Streams to provide interactions
 *
 * @namespace music21.streamInteraction
 * @memberof music21
 * @requires music21/common
 * @requires music21/stream
 */
export const streamInteraction = {};

/**
 * Object for adding scrolling while playing.
 *
 * @class ScrollPlayer
 * @memberof music21.streamInteraction
 * @param {music21.stream.Stream} s -- Stream
 * @param {canvas} c -- canvas
 * @property {music21.streamInteraction.PixelMapper} pixelMapper - an object that can map current pixel to notes and vice versa.
 * @property {number} [tempo=s.tempo]
 * @property {number} lastX - last X value
 * @property {Int} lastNoteIndex - index of last note played
 * @property {SVGDOMObject} barDOM - DOM object representing the scrolling bar
 * @property {SVGDOMObject} svgDOM - DOM object holding the scrolling bar (overlaid on top of canvas)
 * @property {DOMObject} canvasParent - the parent DOM object for `this.canvas`
 * @property {Int} lastTimeout - a numerical reference to a timeout object created by `setTimeout`
 * @property {number} startTime - the time in ms when the scrolling started
 * @property {Int} [previousSystemIndex=0] - the last systemIndex being scrolled
 * @property {number} [eachSystemHeight=120] - currently all systems need to have the same height.
 * @property {Int} [timingMS=50] - amount of time between polls to scroll
 * @property {function} savedRenderOptionClick - starting ScrollPlayer overrides the `'click'` event for the stream, switching it to Stop. this saves it for restoring later.
 */
export class ScrollPlayer {
    constructor(s, c) {
        this.pixelMapper = new streamInteraction.PixelMapper(s);
        this.stream = s;
        this.canvas = c;
        this.tempo = s.tempo;
        this.lastX = 0;
        this.lastNoteIndex = -1;
        this.barDOM = undefined;
        this.svgDOM = undefined;
        this.canvasParent = undefined;
        this.lastTimeout = undefined;
        this.startTime = new Date().getTime();
        this.previousSystemIndex = 0;
        this.eachSystemHeight = 120;
        this.timingMS = 50;
        this.savedRenderOptionClick = undefined;
        /**
         * function, bound to `this` to scroll the barDOM.
         *
         * calls itself until a stop click is received or the piece ends.
         *
         * @method streamInteraction.ScrollPlayer#scrollScore
         * @memberof music21.streamInteraction.ScrollPlayer
         */
        this.scrollScore = (function scrollScore() {
            const timeSinceStartInMS = new Date().getTime() - this.startTime;
            const offset = timeSinceStartInMS / 1000 * this.tempo / 60;
            const pm = this.pixelMapper;
            const systemIndex = pm.getSystemIndexAtOffset(offset);

            if (systemIndex > this.previousSystemIndex) {
                this.lastX = -100; // arbitrary negative...
                this.previousSystemIndex = systemIndex;
                this.barDOM.setAttribute('y', systemIndex * this.eachSystemHeight);
            }
            let x = pm.getXAtOffset(offset);
            x = Math.floor(x);

            // console.log(x);

            if (x > this.lastX) {
                this.barDOM.setAttribute('x', x);
                this.lastX = x;
            }
            // pm is a pixelMap not a Stream
            for (let j = 0; j < pm.allMaps.length; j++) {
                const pmOff = pm.allMaps[j].offset;
                if (j <= this.lastNoteIndex)  {
                    continue;
                } else if (Math.abs(offset - pmOff) > 0.1) {
                    continue;
                }
                const elList = pm.allMaps[j].elements;
                for (let elIndex = 0; elIndex < elList.length; elIndex++) {
                    const el = elList[elIndex];
                    if (el !== undefined && el.playMidi !== undefined) {
                        el.playMidi(this.tempo);
                    }
                }
                this.lastNoteIndex = j;
            }
            // console.log(x, offset);
            // console.log(barDOM.setAttribute);
            let newTimeout;
            if (x < pm.maxX || systemIndex < pm.maxSystemIndex) {
                // console.log(x, pm.maxX);
                newTimeout = setTimeout(this.scrollScore, this.timingMS);
                this.lastTimeout = newTimeout;
            } else {
                const fauxEvent = undefined;
                this.stopPlaying(fauxEvent);
            }
        }).bind(this);
    }


    /**
     * Create the scrollbar (barDOM), the svg to place it in (svgDOM)
     * and append it over the stream.
     *
     * Sets as a consequence:
     * - this.barDOM
     * - this.svgDOM
     * - this.eachSystemHeight
     * - this.canvasParent
     *
     * @memberof music21.streamInteraction.ScrollPlayer
     * @returns {SVGDOMObject} scroll bar
     */
    createScrollBar() {
        const canvas = this.canvas;
        const svgDOM = common.makeSVGright('svg', {
            'height': canvas.height.toString() + 'px',
            'width': canvas.width.toString() + 'px',
            'style': 'position:absolute; top: 0px; left: 0px;',
        });
        const scaleY = this.stream.renderOptions.scaleFactor.y;
        const eachSystemHeight = canvas.height / (scaleY * (this.pixelMapper.maxSystemIndex + 1));
        const barDOM = common.makeSVGright('rect', {
            width: 10,
            height: eachSystemHeight - 6,  // small fudge for separation
            x: this.pixelMapper.startX,
            y: 3,
            style: 'fill: rgba(255, 255, 20, .5);stroke:white',
        });
        barDOM.setAttribute('transform', 'scale(' + scaleY  + ')');
        svgDOM.appendChild(barDOM);

        const canvasParent = $(canvas).parent()[0];
        canvasParent.appendChild(svgDOM);
        this.barDOM = barDOM;
        this.svgDOM = svgDOM;
        this.canvasParent = canvasParent;
        this.eachSystemHeight = eachSystemHeight;
        return barDOM;
    }

    /**
     * start playing! Create a scroll bar and start scrolling
     *
     * (set this to an event on stream, or something...)
     *
     * currently called from {@link music21.stream.Stream#scrollScoreStart} via
     * {@link music21.stream.Stream#renderScrollableCanvas}. Will change.
     *
     * @memberof music21.streamInteraction.ScrollPlayer
     */
    startPlaying() {
        this.createScrollBar();

        this.savedRenderOptionClick = this.stream.renderOptions.events.click;
        this.stream.renderOptions.events.click = (function startPlayingClick(e) { this.stopPlaying(e); }).bind(this);
        this.stream.setRenderInteraction(this.canvasParent);
        this.scrollScore();
    }

    /**
     * Called when the ScrollPlayer should stop playing
     *
     * @memberof music21.streamInteraction.ScrollPlayer
     * @param {DOMEvent} [event]
     */
    stopPlaying(event) {
        this.stream.renderOptions.events.click = this.savedRenderOptionClick;
        this.barDOM.setAttribute('style', 'display:none');
        // TODO: generalize...
        this.canvasParent.removeChild(this.svgDOM);
        if (this.lastTimeout !== undefined) {
            clearTimeout(this.lastTimeout);
        }
        this.stream.setRenderInteraction(this.canvasParent);
        if (event !== undefined) {
            event.stopPropagation();
        }
    }
}
streamInteraction.ScrollPlayer = ScrollPlayer;


/**
 * A `PixelMapper` is an object that knows how to map offsets to pixels on a flat Stream.
 *
 * Helper for ScrollPlayer and soon other places...
 *
 * @class PixelMapper
 * @memberof music21.streamInteraction
 * @param {music21.stream.Stream} s - stream object
 * @property {Array<music21.streamInteraction.PixelMap>} allMaps - a `PixelMap` object for each offset in the Stream and one additional one for the end of the Stream.
 * @property {music21.stream.Stream} s - stream object
 * @property {music21.stream.Stream} notesAndRests - `this.stream.flat.notesAndRests`
 * @property {number} pixelScaling - `this.stream.renderOptions.scaleFactor.x`
 * @property {number} startX - (readonly) starting x
 * @property {number} maxX - (readonly) ending x
 * @property {Int} maxSystemIndex - the index of the last system.
 */
export class PixelMapper {
    constructor(s) {
        this.allMaps = [];
        this.stream = s;
        this.notesAndRests = this.stream.flat.notesAndRests;
        this.pixelScaling = s.renderOptions.scaleFactor.x;
        this.processStream(s);
    }
    get startX() {
        return this.allMaps[0].x;
    }
    get maxX() {
        const m = this.allMaps[this.allMaps.length - 1];
        return m.x;
    }
    get maxSystemIndex() {
        return this.allMaps[this.allMaps.length - 1].systemIndex;
    }
    /**
     * Creates `PixelMap` objects for every note in the stream, and an extra
     * one mapping the end of the final offset.
     *
     * @memberof music21.streamInteraction.PixelMapper
     * @returns {Array<music21.streamInteraction.PixelMap>}
     */
    processStream() {
        const ns = this.notesAndRests;
        for (let i = 0; i < ns.length; i++) {
            const n = ns.get(i);
            this.addNoteToMap(n);
        }
        // prepare final map.
        const finalStave =  ns.get(-1).activeVexflowNote.stave;
        const finalX = (finalStave.x + finalStave.width);
        const endOffset = ns.get(-1).duration.quarterLength + ns.get(-1).offset;

        const lastMap = new streamInteraction.PixelMap(this, endOffset);
        lastMap.elements = [undefined];
        lastMap.x = finalX;
        lastMap.systemIndex = this.allMaps[this.allMaps.length - 1].systemIndex;
        this.allMaps.push(lastMap);
        return this.allMaps;
    }


    /**
     * Adds a {@link music21.base.Music21Object}, usually a {@link music21.note.Note} object,
     * to the maps for the PixelMapper if a {@link music21.streamInteraction.PixelMap} object
     * already exists at that location, or creates a new `PixelMap` if one does not exist.
     *
     * @memberof music21.streamInteraction.PixelMapper
     * @param {music21.base.Music21Object} n - note or other object
     * @returns {music21.streamInteraction.PixelMap} PixelMap added to.
     */
    addNoteToMap(n) {
        const currentOffset = n.offset;
        const properMap = this.findMapForExactOffset(currentOffset);
        if (properMap !== undefined) {
            properMap.elements.push(n);
            return properMap;
        } else {
            const pmap = new streamInteraction.PixelMap(this, currentOffset);
            pmap.elements = [n];
            this.allMaps.push(pmap);
            return pmap;
        }
    }
    /**
     * Finds a `PixelMap` object if one matches this exact offset. Otherwise returns undefined
     *
     * @memberof music21.streamInteraction.PixelMapper
     * @param {number} o offset
     * @returns {music21.streamInteraction.PixelMap|undefined}
     */
    findMapForExactOffset(o) {
        for (let j = this.allMaps.length - 1; j >= 0; j -= 1) {
            // find the last map with this offset. searches backwards for speed.
            if (this.allMaps[j].offset === o) {
                return this.allMaps[j];
            }
        }
        return undefined;
    }

    /**
     *  returns an array of two pixel maps: the previous/current one and the
            next/current one (i.e., if the offset is exactly the offset of a pixel map
            the prevNoteMap and nextNoteMap will be the same; similarly if the offset is
            beyond the end of the score)

     * @memberof music21.streamInteraction.PixelMapper
     * @param {number} offset
     * @returns {Array<music21.streamInteraction.PixelMap|undefined>} returns two PixelMaps; or either (but not both) can be undefined
     * @example
     * var s = new music21.tinyNotation.TinyNotation('3/4 c4 d8 e f4 g4 a4 b4');
     * var can = s.appendNewCanvas();
     * var pm = new music21.streamInteraction.PixelMapper(s);
     * var pmaps = pm.getPixelMapsAropundOffset(1.25);
     * var prev = pmaps[0];
     * var next = pmaps[1];
     * prev.offset
     * // 1
     * next.offset
     * // 1.5
     * prev.x
     * // 97...
     * next.x
     * // 123...
     */
    getPixelMapsAroundOffset(offset) {
        let prevNoteMap;
        let nextNoteMap;
        for (let i = 0; i < this.allMaps.length; i++) {
            const thisMap = this.allMaps[i];
            if (thisMap.offset <= offset) {
                prevNoteMap = thisMap;
            }
            if (thisMap.offset >= offset) {
                nextNoteMap = thisMap;
                break;
            }
        }
        if (prevNoteMap === undefined && nextNoteMap === undefined) {
            const lastNoteMap = this.allMaps[this.allMaps.length - 1];
            prevNoteMap = lastNoteMap;
            nextNoteMap = lastNoteMap;
        } else if (prevNoteMap === undefined) {
            prevNoteMap = nextNoteMap;
        } else if (nextNoteMap === undefined) {
            nextNoteMap = prevNoteMap;
        }
        return [prevNoteMap, nextNoteMap];
    }
    /**
     * Uses the stored offsetToPixelMaps to get the pixel X for the offset.
     *
     * @memberof music21.streamInteraction.PixelMapper
     * @param {number} offset
     * @param {Array<music21.streamInteraction.PixelMap>} offsetToPixelMaps
     * @returns {number}
     * @example
     * var s = new music21.tinyNotation.TinyNotation('3/4 c4 d8 e f4 g4 a4 b4');
     * var can = s.appendNewCanvas();
     * var pm = new music21.streamInteraction.PixelMapper(s);
     * pm.getXAtOffset(0.0); // exact placement of a note
     * // 89.94...
     * pm.getXAtOffset(0.5); // between two notes
     * // 138.63...
     */
    getXAtOffset(offset) {
        // returns the proper
        const twoNoteMaps = this.getPixelMapsAroundOffset(offset);
        const prevNoteMap = twoNoteMaps[0];
        const nextNoteMap = twoNoteMaps[1];
        const pixelScaling = this.pixelScaling;
        const offsetFromPrev = offset - prevNoteMap.offset;
        const offsetDistance = nextNoteMap.offset - prevNoteMap.offset;
        let pixelDistance = nextNoteMap.x - prevNoteMap.x;
        if (nextNoteMap.systemIndex !== prevNoteMap.systemIndex) {
            const stave = prevNoteMap.elements[0].activeVexflowNote.stave;
            pixelDistance = (stave.x + stave.width) * pixelScaling - prevNoteMap.x;
        }
        let offsetToPixelScale = 0;
        if (offsetDistance !== 0) {
            offsetToPixelScale = pixelDistance / offsetDistance;
        } else {
            offsetToPixelScale = 0;
        }
        const pixelsFromPrev = offsetFromPrev * offsetToPixelScale;
        const offsetX = prevNoteMap.x + pixelsFromPrev;
        return offsetX / pixelScaling;
    }

    /**
     * Uses the stored offsetToPixelMaps to get the systemIndex active at the current time.
     *
     * @memberof music21.streamInteraction.PixelMapper
     * @param {number} offset
     * @returns {number} systemIndex of the offset
     */
    getSystemIndexAtOffset(offset) {
        const twoNoteMaps = this.getPixelMapsAroundOffset(offset);
        const prevNoteMap = twoNoteMaps[0];
        return prevNoteMap.systemIndex;
    }
}
streamInteraction.PixelMapper = PixelMapper;


/*  PIXEL MAP */

/**
 * A PixelMap maps one offset to one x location.
 *
 * The offset does NOT have to be the offset of an element. Offsets are generally
 * measured from the start of the flat stream.
 *
 * @class PixelMap
 * @memberof music21.streamInteraction
 * @param {music21.streamInteraction.PixelMapper} mapper - should eventually be a weakref...
 * @param {number} offset - the offset that is being mapped.
 * @property {Array<music21.base.Music21Object>} elements -- elements being mapped to.
 * @property {number} offset - the offset inputted
 * @property {number} x - x value in pixels for this offset
 * @property {Int} systemIndex - the systemIndex at which this offset appears.
 * @example
 * // not a particularly realistic example, since it requires so much setup...
 * var s = new music21.tinyNotation.TinyNotation('3/4 c4 d8 e f4 g4 a4 b4');
 * var can = s.appendNewCanvas();
 * var pmapper = new music21.streamInteraction.PixelMapper(s);
 * var pmapA = new music21.streamInteraction.PixelMap(pmapper, 2.0);
 * pmapA.elements = [s.flat.get(3)];
 * pmapA.offset;
 * // 2
 * pmapA.x;
 * // 149.32...
 * pmapA.systemIndex
 * // 0
 */
export class PixelMap {
    constructor(mapper, offset) {
        this.pixelScaling = mapper.pixelScaling; // should be a Weakref...
        this.elements = [];
        this.offset = offset; // important
        this._x = undefined;
        this._systemIndex = undefined;
    }
    get x() {
        if (this._x !== undefined) {
            return this._x;
        } else if (this.elements.length === 0) {
            return 0; // error!
        } else {
            return this.elements[0].x * this.pixelScaling;
        }
    }
    set x(x) {
        this._x = x;
    }
    get systemIndex() {
        if (this._systemIndex !== undefined) {
            return this._systemIndex;
        } else if (this.elements.length === 0) {
            return 0; // error!
        } else {
            return this.elements[0].systemIndex;
        }
    }
    set systemIndex(systemIndex) {
        this._systemIndex = systemIndex;
    }
}
streamInteraction.PixelMap = PixelMap;

/*  NOT DONE YET */
export class CursorSelect {
    constructor(s) {
        this.stream = s;
        this.activeElementHierarchy = [undefined];
    }
}
streamInteraction.CursorSelect = CursorSelect;
