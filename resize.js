const fs = require('fs');
let html = fs.readFileSync('www/index.html', 'utf8');

// The replacement script
html = html.replace(/class="h-10 pl-3 pr-2 rounded-l-lg/g, 'class="h-8 pl-2 pr-1 rounded-l-lg');
html = html.replace(/class="h-10 px-1\.5 rounded-r-lg/g, 'class="h-8 px-1 rounded-r-lg');
html = html.replace(/class="h-10 px-3/g, 'class="h-8 px-2');
html = html.replace(/class="h-10 pl-3 pr-2 rounded-lg/g, 'class="h-8 px-2 rounded-lg');
html = html.replace(/text-lg/g, 'text-[15px]');

// Fix dropdown containers to spawn higher up
html = html.replace(/top-12/g, 'top-9');

// Make the icon SVGs slightly smaller
html = html.replace(/width="22" height="22"/g, 'width="16" height="16"');

// Fix the line 1 container
html = html.replace(/h-12 flex items-center justify-between px-2/g, 'h-10 flex items-center justify-between px-1');

// Adjust padding and margins to save space
html = html.replace(/px-3 shadow/g, 'px-1 shadow');
html = html.replace(/gap-1\.5 h-9/g, 'gap-0.5 h-8');
html = html.replace(/w-px h-5/g, 'w-px h-4');

fs.writeFileSync('www/index.html', html, 'utf8');
console.log('Done mapping line 1 compact sizes!');
