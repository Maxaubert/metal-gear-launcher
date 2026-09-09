# Menu motion

Preserve the existing extracted artwork, typography and fixed menu geometry. Game Selection
uses one moving accent bracket as the focus cue, with a 360 ms horizontal reveal connecting
the old and new game artwork. Focus and confirmation remain immediate. Rapid input replaces
the in-flight reveal rather than queuing transitions. Main and Options navigation retain the
same mounted backdrop. Reduced motion switches artwork and the bracket immediately.

Startup uses a white splash with dark branding, a red progress bar, no decorative frame, and an original neutral METAL GEAR SOLID wordmark with
readable hub branding. Content fades in over 400 ms. The splash remains for at least four seconds
and until artwork, settings and audio are ready. Its bar fills toward 90% during the opening,
reaches 100% only when preparation completes, and stays complete briefly before the 400 ms exit.
That menu stays inert throughout the fade. Reduced motion keeps the four-second minimum and
uses immediate visibility changes. Existing startup recovery remains keyboard and controller
accessible. Branding is bundled and independent of installed games or Playnite.

Implementation: isolate selection motion in its own stylesheet and retain interrupted artwork
only until the original 360 ms deadline; add the splash around the existing readiness barrier. Verify rapid
keyboard and pointer navigation, confirmation during motion, reduced motion, unchanged menu
geometry, delayed startup and recovery. Review real-asset captures before opening the PR.
