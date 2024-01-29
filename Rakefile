require "rake/tasklib"
task :default => "static/irb.wasm"

desc "Build irb.wasm"
file "static/irb.wasm" => [] do
  sh "bundle exec rbwasm build --ruby-version 3.3 -o static/irb.wasm"
  sh "bundle exec rbwasm pack static/irb.wasm --dir ./fake-gems::/gems -o static/irb.wasm"
end

desc "Clean build artifacts"
task :clean do
  rm_f "static/irb.wasm"
end

desc "Start local parcel server"
task :parcel do
  sh "npx parcel ./src/index.html"
end
