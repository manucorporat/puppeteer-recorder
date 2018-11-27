import eventsToRecord from '../code-generator/dom-events-to-record'
import elementsToBindTo from '../code-generator/elements-to-bind-to'
import finder from '@medv/finder'

class EventRecorder {
  constructor () {
    this.eventLog = []
    this.previousEvent = null
  }

  start () {
    chrome.storage.local.set({ location: {
      path: document.location.pathname,
      title: document.title
    }}, () => {
      console.debug('location saved');
    });

    chrome.storage.local.get(['options'], ({ options }) => {
      const {dataAttribute} = options ? options.code : {}
      if (dataAttribute) {
        this.dataAttribute = dataAttribute
      }

      const events = Object.values(eventsToRecord)
      if (!window.pptRecorderAddedControlListeners) {
        this.addAllListeners(elementsToBindTo, events)
        window.pptRecorderAddedControlListeners = true
      }

      if (!window.document.pptRecorderAddedControlListeners && chrome.runtime && chrome.runtime.onMessage) {
        const boundedGetCurrentUrl = this.getCurrentUrl.bind(this)
        const boundedGetViewPortSize = this.getViewPortSize.bind(this)
        chrome.runtime.onMessage.addListener(boundedGetCurrentUrl)
        chrome.runtime.onMessage.addListener(boundedGetViewPortSize)
        window.document.pptRecorderAddedControlListeners = true
      }

      const msg = { control: 'event-recorder-started' }
      this.sendMessage(msg)
      console.debug('Puppeteer Recorder in-page EventRecorder started')
    })
  }

  addAllListeners (elements, events) {
    const boundedRecordEvent = this.recordEvent.bind(this)
    events.forEach(type => {
      window.addEventListener(type, boundedRecordEvent, true)
    })
    document.addEventListener('keyup', (e) => {
      if (e.ctrlKey && e.code == "KeyS") {
        const div = document.createElement('div');
        div.style.pointerEvents = 'none';
        div.style.position = 'absolute';
        div.style.top = '0';
        div.style.left = '0';
        div.style.opacity = '1';
        div.style.transition = 'opacity 400ms ease-in';
        div.style.background = 'white';
        div.style.width = '100vw';
        div.style.height = '100vh';
        console.log('screenshot');
        document.body.appendChild(div);
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            div.style.opacity = '0';
            setTimeout(() => div.remove(), 500);
          });
        });
        this.sendMessage({
          action: 'screenshot',
        })
      }

    });
  }

  sendMessage (msg) {
    console.debug('sending message', msg)
    try {
      // poor man's way of detecting whether this script was injected by an actual extension, or is loaded for
      // testing purposes
      if (chrome.runtime && chrome.runtime.onMessage) {
        chrome.runtime.sendMessage(msg)
      } else {
        this.eventLog.push(msg)
      }
    } catch (err) {
      console.debug('caught error', err)
    }
  }

  getCurrentUrl (msg) {
    if (msg.control && msg.control === 'get-current-url') {
      console.debug('sending current url:', window.location.href)
      this.sendMessage({ control: msg.control, href: window.location.href })
    }
  }

  getViewPortSize (msg) {
    if (msg.control && msg.control === 'get-viewport-size') {
      console.debug('sending current viewport size')
      this.sendMessage({ control: msg.control, coordinates: { width: window.innerWidth, height: window.innerHeight } })
    }
  }

  recordEvent (e) {
    if (this.previousEvent && this.previousEvent.timeStamp === e.timeStamp) return
    this.previousEvent = e

    const selector = e.target.hasAttribute && e.target.hasAttribute(this.dataAttribute)
      ? formatDataSelector(e.target, this.dataAttribute)
      : finder(e.target, {
        tagName: () => true,
        className: () => false,
        idName: () => true,
        seedMinLength: 1,
        optimizedMinLength: 6
      })

    const msg = {
      selector: selector,
      value: e.target.value,
      tagName: e.target.tagName,
      action: e.type,
      keyCode: e.keyCode ? e.keyCode : null,
      href: e.target.href ? e.target.href : null,
      coordinates: getCoordinates(e)
    }
    this.sendMessage(msg)
  }

  getEventLog () {
    return this.eventLog
  }

  clearEventLog () {
    this.eventLog = []
  }
}

function getCoordinates (evt) {
  const eventsWithCoordinates = {
    mouseup: true,
    mousedown: true,
    mousemove: true,
    mouseover: true
  }
  return eventsWithCoordinates[evt.type] ? { x: evt.clientX, y: evt.clientY } : null
}

function formatDataSelector (element, attribute) {
  return `[${attribute}=${element.getAttribute(attribute)}]`
}

window.eventRecorder = new EventRecorder()
window.eventRecorder.start()
