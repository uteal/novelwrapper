-- Nwrap Aseprite Exporter | (c) 2024 uteal | MIT License

-- Though suitable for general use, this script is designed as part of the
-- NovelWrapper visual novel toolkit: https://github.com/uteal/novelwrapper

-- Aseprite Sprite Editor: https://aseprite.org

-- The script allows you to export a properly structured .aseprite file as a folder of game-ready resources:
-- a bunch of per-sprite regular PNG sheets, and a single JSON file with all the corresponding information.
-- To use, put the script in Aseprite scripts folder (as of 2024: File -> Scripts -> Open Scripts Folder).

-- [READ BEFORE USE]

-- Script will IGNORE:
-- 1) Hidden layers and hidden groups.
-- 2) Layers and groups whose name contains __ (double underscore).

-- How it works:
-- Each first-level (non-nested) group with one or more visible layers will be converted into a sprite group.
-- Each non-empty image layer inside (including those in nested groups) will be converted into a sprite.
-- First-level image layers become self-containing groups with one sprite inside.
-- All sprite frames are saved with an offset of one pixel. To change this, edit the
-- "offset" variable that comes immediately after the function declaration block.

-- Passing custom flags:
-- You can pass additional information about the sprite, which will be reflected inside the JSON file.
-- Additional parameters (flags) should be written after the layer name and prefixed with "#" or "--".

-- Example layer names:
--   mossy_stone #decoration   <- flags = ["decoration"]. Sprite name will be "mossy_stone".
--   mossy_stone               <- flags = []. Sprite name will be "mossy_stone".
--   hummingbird --is fast     <- flags = ["is fast"]. Sprite name will be "hummingbird".
--   doge # so sparse # w o w  <- flags = ["so sparse", "w o w"]. Sprite name will be "doge".
--   fruits--healhy#yummy      <- flags = ["healhy", "yummy"]. Sprite name will be "fruits".
--   clouds     --0---1--2     <- flags = ["0", "-1", "2"]. Sprite name will be "clouds".
--   b a n a n a#yeah!         <- flags = ["yeah!"]. Sprite name will be "b a n a n a".
--   __background              <- IGNORED because of double underscore.
--   alchemist #full__metal    <- IGNORED as well, so be careful.

-- Notes:
--   1) The script will try to create a spritesheet file using the sprite name (+".png"). So do not
--   name layers with characters that cannot be part of a valid file name in your operating system.
--   The resulting folder will be created in the same directory where the opened .aseprite file is
--   located, with the same name as the file (without ".aseprite" extension).
--   2) Don't be afraid of copy-pasting your sprites: sprites with identical frames will refer to
--   the same spritesheet, differing only in additional parameters inside JSON file.
--   3) The latter also applies to duplicating the same image in different frames of the same sprite.
--   If the images in different frames do not differ, or differ only in position, this will not lead
--   to spritesheet bloating.
--   4) For security reasons, the script does not clear the entire folder where it writes images.
--   So, if necessary, take care of this yourself.

local sprite = app.activeSprite

if not sprite then
  app.alert("No image found.")
  return
end

-- [declarations]

--- Splits the full path to a file into its folder path and file name.
--- @param str string: The full path name of .aseprite file.
--- @return string: Path to file's folder.
--- @return string: File name without extension.
--- @return string: Slash symbol. Depends on the operating system.
local function parseFileName(str)
  local last_slash_index, last_point_index
  for i = 1, #str do
    local ch = str:sub(i, i)
    if ch == "/" or ch == "\\" then
      last_slash_index = i
    elseif ch == "." then
      last_point_index = i
    end
  end
  if not last_slash_index then
    error("First save the file somewhere on a disk.")
  end
  return
    str:sub(1, last_slash_index - 1),
    str:sub(last_slash_index + 1, last_point_index - 1),
    str:sub(last_slash_index, last_slash_index)
end

--- Parses the layer name, returning the sprite metadata.
--- @param str string: Layer name.
--- @return string: Sprite name.
--- @return table: Array of sprite flags.
local function parseLayerName(str)
  str = str:gsub("%-%-", "#")
  local first = str:find("#")
  local spr_name = first and str:sub(1, first - 1) or str
  spr_name = spr_name:gsub("^%s+", ""):gsub("%s+$", "")
  local flags_str = first and str:sub(first, #str) or ""
  local flags = {}
  if #flags_str > 0 then
    for flag in flags_str:gmatch("#([^#]*)%s*") do
      flag = flag:gsub("^%s+", ""):gsub("%s+$", "")
      if #flag > 0 then
        table.insert(flags, flag)
      end
    end
  end
  return spr_name, flags
end

--- Checks whether the given string is a valid layer name.
--- @param str string
--- @return boolean
local function isAllowed(str)
  return str:match("__") == nil
end

--- Extracts available image layers from the given layer set.
--- @param layers table
--- @param acc table
--- @return table
local function extract(layers, acc)
  for _, layer in ipairs(layers) do
    if layer.isVisible and isAllowed(layer.name) then
      if layer.isGroup then
        extract(layer.layers, acc)
      elseif layer.isImage and #layer.cels > 0 then
        table.insert(acc, layer)
      end
    end
  end
  return acc
end

--- Determines the optimal number of rows and columns in a spritesheet.
--- @param count integer
--- @param ratio number
--- @return integer: Number of rows.
--- @return integer: Number of columns.
local function chooseSpriteSheetGrid(count, ratio)
  if count == 1 then return 1, 1 end
  if count == 2 then if ratio > 1 then return 2, 1 else return 1, 2 end end
  if count == 3 then if ratio > 1 then return 3, 1 else return 1, 3 end end
  if ratio >= (count / 1) then return count, 1 end
  if ratio <= (1 / count) then return 1, count end
  local rows, cols
  if ratio > 1 then
    rows = math.ceil(math.sqrt(count))
    cols = math.ceil(count / rows)
  else
    cols = math.ceil(math.sqrt(count))
    rows = math.ceil(count / cols)
  end
  return rows, cols
end

--- If there is already frame with the same image, returns its number.
--- @param cel table
--- @param cels table
--- @return integer|nil
local function getSameFrameNum(cel, cels)
  for n, c in ipairs(cels) do
    if c.image:isEqual(cel.image) then
      return n - 1
    end
  end
end

--- If there is already given image in images, returns its filename.
--- @param image table
--- @param images table
--- @return string|nil
local function findSimilarImageFilename(image, images)
  for fname, img in pairs(images) do
    if image.width == img.width and image.height == img.height then
      for y = 0, image.height - 1 do
        for x = 0, image.width - 1 do
          if image:getPixel(x, y) ~= img:getPixel(x, y) then
            goto next_image
          end
        end
      end
      return fname
    end
    ::next_image::
  end
  return nil
end

-- [/declarations]

local offset = 1

local groups = {}

do
  local count = 0
  for _, layer in ipairs(sprite.layers) do
    if layer.isVisible and isAllowed(layer.name) then
      if layer.isGroup then
        local image_layers = extract(layer.layers, {})
        if #image_layers > 0 then
          table.insert(groups, { name = layer.name, layers = image_layers })
          count = count + #image_layers
        end
      elseif layer.isImage and #layer.cels > 0 then
        local index = layer.name:find(">")
        local cleaned_name = index and layer.name:sub(1, index - 1) or layer.name
        cleaned_name = cleaned_name:gsub("^%s+", ""):gsub("%s+$", "")
        table.insert(groups, { name = cleaned_name, layers = { layer } })
        count = count + 1
      end
    end
  end
  if count == 0 then
    print("No convertible layers found.")
    return
  end
end

local path, title, slash = parseFileName(sprite.filename)
local atlas = {
  screen = {
    width = sprite.width,
    height = sprite.height
  },
  groups = {},
  sprites = {}
}

print("Writing to folder: " .. path .. slash .. title)

local images = {}
local filenames = {}

for _, group in ipairs(groups) do
  local layers = group.layers
  print("\n-- " .. group.name .. " --\n")

  table.insert(atlas.groups, { name = group.name, sprites = {} })

  for _, layer in ipairs(layers) do

    local sprite_name, flags = parseLayerName(layer.name)
    local filename
    do
      local count = filenames[sprite_name]
      if count == nil then
        count = 1
        filename = sprite_name
      else
        count = count + 1
        filename = sprite_name .. "__" .. count
      end
      filename = filename
      filenames[sprite_name] = count
    end

    local spec = {
      name = sprite_name,
      flags = flags,
      source = filename,
      sheet = {
        width = 0,
        height = 0,
        rows = 0,
        cols = 0
      },
      frames = {
        unique = 0,
        order = {},
        shift = {}
      }
    }

    table.insert(atlas.sprites, spec)
    table.insert(atlas.groups[#atlas.groups].sprites, #atlas.sprites - 1)

    local unique_cels = {}

    for _, cel in ipairs(layer.cels) do
      if cel ~= nil then
        local n = getSameFrameNum(cel, unique_cels)
        local b = cel.bounds
        table.insert(spec.frames.order, n or #unique_cels)
        table.insert(spec.frames.shift, { b.x, b.y })
        if not n then
          table.insert(unique_cels, cel)
        end
      end
    end

    spec.frames.unique = #unique_cels

    local top = 1/0
    local left = 1/0
    local right = -1/0
    local bottom = -1/0

    for _, cel in ipairs(unique_cels) do
      local rect = cel.image:shrinkBounds()
      rect.origin = rect.origin + cel.bounds.origin
      if rect.x < left then left = rect.x end
      if rect.y < top then top = rect.y end
      if rect.x + rect.width > right then right = rect.x + rect.width end
      if rect.y + rect.height > bottom then bottom = rect.y + rect.height end
    end

    if offset > 0 then
      left = left - offset
      right = right + offset
      top = top - offset
      bottom = bottom + offset
    end

    local frame_width = right - left
    local frame_height = bottom - top
    local rows, cols = chooseSpriteSheetGrid(#unique_cels, frame_width / frame_height)

    spec.sheet.rows = rows
    spec.sheet.cols = cols
    spec.sheet.width = frame_width * cols
    spec.sheet.height = frame_height * rows

    local image = Image(frame_width * cols, frame_height * rows)

    do
      local i = 1
      for y = 1, rows do
        for x = 1, cols do
          local cel = unique_cels[i]
          if cel == nil then break end
          local b = cel.bounds
          image:drawImage(
            cel.image,
            Point(
              (x - 1) * frame_width + (b.x - left),
              (y - 1) * frame_height + (b.y - top)
            )
          )
          i = i + 1
        end
      end
    end

    local similarImageFilename = findSimilarImageFilename(image, images)
    if similarImageFilename then
      spec.source = similarImageFilename
    else
      images[filename] = image
      image:saveAs(path .. slash .. title .. slash .. filename .. ".png")
    end

    if #layer.cels > 1 then
      print(sprite_name .. ": " .. #layer.cels .. " frames (" .. #unique_cels .. " unique)")
    else
      print(sprite_name)
    end

  end
end

do
  local count = 0
  for _ in pairs(images) do
    count = count + 1
  end
  print("\nPNG sheets created: " .. count)
end

local file = io.open(path .. slash .. title .. slash .. "atlas.json", "w")

if file ~= nil then
  file:write(json.encode(atlas))
  file:close()
end

print("\nJSON file written. All done.")
