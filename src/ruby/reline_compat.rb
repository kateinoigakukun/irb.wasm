module Reline

  class Unicode
    def self.calculate_width(str, allow_escape_code = false)
      str.length
    end
  end

  class LineEditor

    # I totally don't know why, though auto-indent works
    # with this snippet pasted here from reline/line_editor.rb
    private def process_auto_indent
      return if not @check_new_auto_indent and @previous_line_index # move cursor up or down
      if @check_new_auto_indent and @previous_line_index and @previous_line_index > 0 and @line_index > @previous_line_index
        # Fix indent of a line when a newline is inserted to the next
        new_lines = whole_lines(index: @previous_line_index, line: @line)
        new_indent = @auto_indent_proc.(new_lines[0..-3].push(''), @line_index - 1, 0, true)
        md = @line.match(/\A */)
        prev_indent = md[0].count(' ')
        @line = ' ' * new_indent + @line.lstrip

        new_indent = nil
        result = @auto_indent_proc.(new_lines[0..-2], @line_index - 1, (new_lines[-2].size + 1), false)
        if result
          new_indent = result
        end
        if new_indent&.>= 0
          @line = ' ' * new_indent + @line.lstrip
        end
      end
      if @previous_line_index
        new_lines = whole_lines(index: @previous_line_index, line: @line)
      else
        new_lines = whole_lines
      end
      new_indent = @auto_indent_proc.(new_lines, @line_index, @byte_pointer, @check_new_auto_indent)
      new_indent = @cursor_max if new_indent&.> @cursor_max
      if new_indent&.>= 0
        md = new_lines[@line_index].match(/\A */)
        prev_indent = md[0].count(' ')
        if @check_new_auto_indent
          @buffer_of_lines[@line_index] = ' ' * new_indent + @buffer_of_lines[@line_index].lstrip
          @cursor = new_indent
          @byte_pointer = new_indent
        else
          @line = ' ' * new_indent + @line.lstrip
          @cursor += new_indent - prev_indent
          @byte_pointer += new_indent - prev_indent
        end
      end
      @check_new_auto_indent = false
    end

  end
end

module Timeout
  def self.timeout(sec, klass = nil, message = nil, &block)
    # possible problem
    # See Reline using `Timeout.timeout` twice
    yield
  end
end

