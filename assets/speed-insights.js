/* Vercel Speed Insights — this site ships as static files with no bundler, so the
   npm package cannot be imported here. Load the script Vercel serves instead.
   Skipped on GitHub Pages, where /_vercel/* does not exist. */
(function(){
  if(location.hostname==='hariomlohardev.github.io')return;
  window.si=window.si||function(){(window.siq=window.siq||[]).push(arguments);};
  var s=document.createElement('script');
  s.defer=true;s.src='/_vercel/speed-insights/script.js';
  document.head.appendChild(s);
})();
