import os
import json

raw_dir = "/Users/dcthehiker/dcthehiker/iPresent/pubHtml/dongjin/raw"
output_file = "/Users/dcthehiker/dcthehiker/iPresent/pubHtml/dongjin/dongjin_kg.json"

files = sorted([f for f in os.listdir(raw_dir) if f.endswith(".json")])

# Define normalization map for entity types
type_map = {
    "人物": "核心人物",
    "核心人物": "核心人物",
    "士族/集团": "士族与集团",
    "士族与集团": "士族与集团",
    "士族": "士族与集团",
    "地名": "地理位置",
    "地理位置": "地理位置",
    "地理位置与重镇": "地理位置",
    "政治局势/制度": "政治局势与制度",
    "政治局势与制度": "政治局势与制度",
    "政治局势": "政治局势与制度",
    "历史事件": "重要历史事件",
    "重要历史事件": "重要历史事件"
}

# Unified entity store: name -> { id, name, type, descriptions: [{ chapter, text }] }
global_entities = {}
# Temporary map from (chapter, local_id) -> entity_name to resolve relationships
local_to_global = {}

# Read all data
chapters_list = []
entity_counter = 1

for filename in files:
    filepath = os.path.join(raw_dir, filename)
    with open(filepath, "r", encoding="utf-8") as f:
        data = json.load(f)
    
    chapter_title = data["chapter"]
    chapters_list.append(chapter_title)
    
    entities = data.get("entities", [])
    relationships = data.get("relationships", [])
    
    # Store local references
    for e in entities:
        name = e["name"]
        local_id = e["id"]
        local_to_global[(chapter_title, local_id)] = name
        
        normalized_type = type_map.get(e["type"], e["type"])
        
        if name not in global_entities:
            global_id = f"G{entity_counter:03d}"
            entity_counter += 1
            global_entities[name] = {
                "id": global_id,
                "name": name,
                "type": normalized_type,
                "descriptions": []
            }
            
        # Append chapter-specific description
        global_entities[name]["descriptions"].append({
            "chapter": chapter_title,
            "text": e["description"]
        })

# Global relationships list
global_relationships = []

# Process existing relationships
relationship_seen = set() # (source_name, target_name, type) to avoid duplicates

for filename in files:
    filepath = os.path.join(raw_dir, filename)
    with open(filepath, "r", encoding="utf-8") as f:
        data = json.load(f)
    
    chapter_title = data["chapter"]
    relationships = data.get("relationships", [])
    
    for rel in relationships:
        src_name = local_to_global.get((chapter_title, rel["source"]))
        tgt_name = local_to_global.get((chapter_title, rel["target"]))
        
        if not src_name or not tgt_name:
            continue
            
        rel_type = rel["type"]
        desc = rel["description"]
        
        # Check for duplicates or similar relations
        rel_key = (src_name, tgt_name, rel_type)
        if rel_key not in relationship_seen:
            relationship_seen.add(rel_key)
            global_relationships.append({
                "source": src_name,
                "target": tgt_name,
                "type": rel_type,
                "description": desc,
                "chapters": [chapter_title]
            })
        else:
            # Append chapter to existing relationship
            for gr in global_relationships:
                if gr["source"] == src_name and gr["target"] == tgt_name and gr["type"] == rel_type:
                    if chapter_title not in gr["chapters"]:
                        gr["chapters"].append(chapter_title)
                    break

# Custom relationships to connect the 12 isolated entities
injected_relationships = [
    # 1. 王敦 (Ch1)
    {"source": "王敦", "target": "王导", "type": "家族关系", "description": "王敦与王导是堂兄弟，两人同心翼戴司马睿南渡建康。"},
    {"source": "王敦", "target": "司马睿 (晋元帝)", "type": "冲突对抗", "description": "王敦因兵权过盛与晋元帝发生冲突，后起兵攻入建康，维持了“共天下”的动态平衡。"},
    {"source": "王敦", "target": "王敦之乱", "type": "事件主导", "description": "王敦是东晋初期两次“王敦之乱”的发起者与统帅。"},
    
    # 2. 琅邪国 (Ch1)
    {"source": "琅邪国", "target": "司马睿 (晋元帝)", "type": "地缘关系", "description": "琅邪国是晋元帝司马睿南渡前的藩王封国。"},
    {"source": "琅邪国", "target": "琅邪王氏", "type": "地缘结合", "description": "琅邪国是琅邪王氏家族的郡望所在地，是“王与马”政治联盟的地理起点。"},
    
    # 3. 八王之乱/永嘉之乱 (Ch1)
    {"source": "八王之乱/永嘉之乱", "target": "永嘉南渡", "type": "历史因果", "description": "西晋中原的战乱是逼迫大量北方士族和百姓向江南进行“永嘉南渡”的直接因果。"},
    {"source": "八王之乱/永嘉之乱", "target": "司马越 (东海王)", "type": "历史参与", "description": "东海王司马越是西晋八王之乱后期的核心实权掌握者。"},
    
    # 4. 苏峻之乱 (Ch2)
    {"source": "苏峻之乱", "target": "庾亮", "type": "冲突诱因", "description": "庾亮执政期间强行征召流民帅苏峻，直接逼反了苏峻，爆发了苏峻之乱。"},
    {"source": "苏峻之乱", "target": "郗鉴", "type": "平叛对抗", "description": "郗鉴以京口为基地，统领流民武力协助朝廷最终平定了苏峻之乱。"},
    
    # 5. 桓范 (Ch4)
    {"source": "桓范", "target": "谯郡桓氏 (龙亢桓氏)", "type": "家族先祖", "description": "曹魏大司农桓范是龙亢桓氏在魏代的代表，其刑家身份被后世桓温家族在东晋时刻意隐瞒。"},
    {"source": "桓范", "target": "桓温", "type": "家族渊源", "description": "桓温是桓范的后裔，桓范因嘉平之变被司马懿诛灭三族，使得桓氏家族在东晋初期地位相对低下。"},
    
    # 6. 金城 (江乘) (Ch4)
    {"source": "金城 (江乘)", "target": "桓温", "type": "历史感怀", "description": "桓温北伐途经金城，看到早年种植的柳树已合抱，发出“木犹如此，人何以堪”的感叹。"},
    
    # 7. 皇权政治 (振兴) (Ch4)
    {"source": "皇权政治 (振兴)", "target": "门阀政治", "type": "体制对抗", "description": "皇权政治的振兴是试图摆脱门阀士族对皇权的长期凌驾，代表了门阀政治向皇权政治复归的努力。"},
    {"source": "皇权政治 (振兴)", "target": "王国宝", "type": "政治附庸", "description": "王国宝作为司马道子的心腹，积极投身于对抗谢安、振兴皇权（王室）的政治行动中。"},
    
    # 8. 简文遗诏纠纷 (Ch4)
    {"source": "简文遗诏纠纷", "target": "晋简文帝 (司马昱)", "type": "核心起因", "description": "简文帝驾崩前拟定让桓温“自取”帝位的遗诏，成为引发这次政治危机的核心。"},
    {"source": "简文遗诏纠纷", "target": "桓温", "type": "核心争夺", "description": "桓温试图通过遗诏实现帝位交接或摄政，但在士族王坦之、谢安的抵制下未能如愿。"},
    {"source": "简文遗诏纠纷", "target": "王坦之", "type": "关键阻击", "description": "王坦之在简文帝病榻前毁掉原诏，迫使简文帝改写遗诏，从而阻断了桓温的篡位之路。"},
    
    # 9. 会稽 (始宁) (Ch5)
    {"source": "会稽 (始宁)", "target": "谢安", "type": "家族隐退", "description": "会稽始宁是陈郡谢氏的庄园 and 退隐地，谢安在“东山再起”前长期隐居于此。"},
    
    # 10. 王国宝 (Ch6)
    {"source": "王国宝", "target": "司马道子", "type": "政治依附", "description": "王国宝作为司马道子的姻亲和党羽，极力投合司马道子以对抗主流门阀。"},
    {"source": "王国宝", "target": "谢安", "type": "谗毁对抗", "description": "王国宝多次在孝武帝面前谗毁谢安，导致谢安晚年失去信任出镇广陵。"},
    
    # 11. 次等士族 (Ch7)
    {"source": "次等士族", "target": "刘裕", "type": "社会阶层", "description": "刘裕是次等士族（寒门武将）的杰出代表，依靠军功最终掀翻了门阀统治。"},
    {"source": "次等士族", "target": "孙恩之乱", "type": "社会动员", "description": "次等士族及底层民众是孙恩之乱的爆发力量，是对东晋门阀政治秩序的暴力洗牌。"},
    
    # 12. 江左 (江南) (Ch8)
    {"source": "江左 (江南)", "target": "门阀政治", "type": "地缘土壤", "description": "江左是门阀政治得以存续的地理空间，门阀士族在此维持偏安格局。"},
    {"source": "江左 (江南)", "target": "永嘉南渡", "type": "移民归宿", "description": "永嘉南渡将大批中原士族人口输入江左，使江左成为华夏文化的避风港。"}
]

# Inject these and link to their chapters
for rel in injected_relationships:
    # Check if this exact relation exists
    rel_key = (rel["source"], rel["target"], rel["type"])
    if rel_key not in relationship_seen:
        relationship_seen.add(rel_key)
        # Find which chapter the source or target isolated node originally came from
        src_chaps = [d["chapter"] for d in global_entities.get(rel["source"], {}).get("descriptions", [])]
        tgt_chaps = [d["chapter"] for d in global_entities.get(rel["target"], {}).get("descriptions", [])]
        chaps = sorted(list(set(src_chaps + tgt_chaps)))
        
        global_relationships.append({
            "source": rel["source"],
            "target": rel["target"],
            "type": rel["type"],
            "description": rel["description"],
            "chapters": chaps if chaps else ["数据关联补充"]
        })

# Compile final JSON structure
output_data = {
    "chapters": chapters_list,
    "entities": list(global_entities.values()),
    "relationships": global_relationships
}

# Write out the file
with open(output_file, "w", encoding="utf-8") as f:
    json.dump(output_data, f, ensure_ascii=False, indent=2)

print(f"[SUCCESS] Unified graph written to {output_file}")
print(f"  Total Unified Entities: {len(output_data['entities'])}")
print(f"  Total Unified Relationships: {len(output_data['relationships'])}")
