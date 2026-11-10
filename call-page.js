// Separate two-phone user interface for the real backend call-session demo.
function callPage(){
  return `<section class="phone-call-page">
    <header class="phone-call-heading">
      <div><div class="eyebrow">VOICE CALL SIMULATION</div><h1>சப்ளையர் தொலைபேசி உரையாடல்</h1><p>Kadai Kural பேசும் · சப்ளையர் பதில் சொல்வார் · விலை கேட்ட பிறகு உரிமையாளர் ஒப்புதல்</p></div>
      <button class="phone-start-call" data-call-action="start">☎ &nbsp; Call wholesaler</button>
    </header>
    <div class="phone-call-error" id="phone-call-error" hidden></div>
    <div class="phone-call-layout">
      <article class="phone-frame wholesaler-phone" id="wholesaler-phone">
        <div class="phone-screen">
          <div class="phone-statusbar"><span>9:41</span><span>● ● ●　▰</span></div>
          <div class="phone-call-contact"><div class="phone-avatar supplier-avatar">SL</div><b>Sri Lakshmi Wholesale</b><small>அரிசி மொத்த விற்பனையாளர் · Demo call</small><span class="phone-call-state" id="wholesaler-call-state">தயார்</span></div>
          <div class="phone-visualizer" id="wholesaler-visualizer"><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i></div>
          <div class="phone-call-caption" id="wholesaler-live-caption">அழைப்பு தொடங்க காத்திருக்கிறது</div>
          <div class="phone-call-controls"><button class="phone-control speaker-control" id="phone-speaker" data-call-action="speaker" title="Toggle speaker">🔊<small>Speaker</small></button><div class="phone-duration" id="phone-call-duration">00:00</div><button class="phone-control end-control" data-call-action="end" title="End call">●<small>End</small></button></div>
        </div><div class="phone-device-label">PHONE 1 · WHOLESALER</div>
      </article>
      <article class="phone-frame owner-phone" id="owner-phone">
        <div class="phone-screen">
          <div class="phone-statusbar"><span>9:41</span><span>● ● ●　▰</span></div>
          <div class="phone-call-contact"><div class="phone-avatar owner-avatar">க</div><b>Kadai Kural</b><small>ஸ்ரீ முருகன் ஸ்டோர்ஸ் சார்பாக பேசுகிறது</small><span class="phone-call-state" id="owner-call-state">தொலைபேசி தயாராக உள்ளது</span></div>
          <div class="phone-visualizer owner-visualizer" id="owner-visualizer"><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i></div>
          <div class="phone-call-caption" id="owner-live-caption">Wholesaler அழைத்தால் இங்கே ring ஆகும்</div>
          <button class="phone-inner-start" data-call-action="start">☎ &nbsp; Call wholesaler</button>
          <div class="phone-call-visual-status" id="phone-call-status">Ready</div>
          <div class="phone-call-controls"><button class="phone-control speaker-control" id="owner-phone-speaker" data-call-action="speaker" title="Toggle call audio">🔊<small>Speaker</small></button><div class="phone-status-pill">Kural + seller audio</div><button class="phone-control end-control" data-call-action="end" title="End call">●<small>End</small></button></div>
        </div><div class="phone-device-label">PHONE 2 · KADAI KURAL</div>
      </article>
    </div>
    <div class="phone-call-footnote">இந்த call simulation app backend-ல் order மற்றும் stock தகவலுடன் இயங்குகிறது. உண்மையான தொலைபேசி அழைப்பு இல்லை.</div>
  </section>`;
}
