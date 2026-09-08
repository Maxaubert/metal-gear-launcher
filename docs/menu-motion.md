# Menu motion

Preserve the existing extracted artwork, typography and fixed menu geometry. Game Selection
uses one moving accent bracket as the focus cue, with a 360 ms horizontal reveal connecting
the old and new game artwork. Focus and confirmation remain immediate. Rapid input replaces
the in-flight reveal rather than queuing transitions. Main and Options navigation retain the
same mounted backdrop. Reduced motion switches artwork and the bracket immediately.

Startup uses a black and red splash, an available locally extracted wordmark, and readable
hub branding. Its loading indicator represents preparation without invented percentages or
an artificial delay. Existing startup recovery remains keyboard and controller accessible.

Implementation: isolate selection motion in its own stylesheet and retain interrupted artwork
only until the original 360 ms deadline; add the splash around the existing readiness barrier. Verify rapid
keyboard and pointer navigation, confirmation during motion, reduced motion, unchanged menu
geometry, delayed startup and recovery. Review real-asset captures before opening the PR.
