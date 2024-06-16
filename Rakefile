require "rake/tasklib"
task :default => "static/irb.wasm"

RUBY_VERSIONS = [
  "3.3", "head"
]

RUBY_VERSIONS.each do |version|
  desc "Build irb.wasm for Ruby #{version}"
  task "static/irb-#{version}.wasm" => [] do
    sh "bundle exec rbwasm build --ruby-version #{version} -o static/irb-#{version}.wasm"
    sh "bundle exec rbwasm pack static/irb-#{version}.wasm --dir ./fake-gems::/gems -o static/irb-#{version}.wasm"
  end
end
desc "Build irb.wasm"
multitask "static/irb.wasm" => RUBY_VERSIONS.map {|version| "static/irb-#{version}.wasm"}

desc "Clean build artifacts"
task :clean do
  rm_f "static/irb.wasm"
end
