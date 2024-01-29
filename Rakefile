$LOAD_PATH << File.join(File.dirname(__FILE__), "vendor", "deps", "ruby.wasm", "lib")

require "rake/tasklib"
retry_count = 0
begin
  require "ruby_wasm/build"
  require "ruby_wasm/rake_task"
rescue LoadError => e
  if retry_count == 0
    sh "git submodule update --init"
    retry_count += 1
    retry
  else
    raise e
  end
end

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
