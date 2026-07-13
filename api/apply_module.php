<?php
/** Dynamic Apply module: normalized opportunities, category-aware applications and admin APIs. */

function apply_categories()
{
    return [
        'jobs' => 'job', 'internships' => 'internship', 'partnerships' => 'partnership',
        'projects' => 'project', 'project-based-hiring' => 'project_based_hiring',
    ];
}

function init_apply_schema()
{
    safely_exec_schema('opportunities', "CREATE TABLE IF NOT EXISTS opportunities (
        id INT AUTO_INCREMENT PRIMARY KEY, category VARCHAR(40) NOT NULL, title VARCHAR(240) NOT NULL,
        slug VARCHAR(255) NOT NULL UNIQUE, department VARCHAR(140) NULL, short_description VARCHAR(600) NOT NULL,
        full_description TEXT NOT NULL, responsibilities TEXT NULL, requirements TEXT NULL, eligibility TEXT NULL,
        skills TEXT NULL, location VARCHAR(180) NULL, work_mode VARCHAR(60) NULL, opportunity_type VARCHAR(100) NULL,
        duration VARCHAR(100) NULL, salary_min DECIMAL(14,2) NULL, salary_max DECIMAL(14,2) NULL,
        stipend DECIMAL(14,2) NULL, budget_min DECIMAL(14,2) NULL, budget_max DECIMAL(14,2) NULL,
        investment_required DECIMAL(14,2) NULL, experience_level VARCHAR(120) NULL, benefits TEXT NULL,
        metadata TEXT NULL, start_date VARCHAR(40) NULL, application_deadline VARCHAR(40) NULL,
        status VARCHAR(30) NOT NULL DEFAULT 'draft', is_featured INT NOT NULL DEFAULT 0,
        created_by VARCHAR(200) NULL, published_at TIMESTAMP NULL DEFAULT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, updated_at TIMESTAMP NULL DEFAULT NULL,
        deleted_at TIMESTAMP NULL DEFAULT NULL, INDEX(category, status), INDEX(application_deadline), INDEX(created_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");
    safely_exec_schema('opportunity_applications', "CREATE TABLE IF NOT EXISTS opportunity_applications (
        id INT AUTO_INCREMENT PRIMARY KEY, reference_number VARCHAR(40) NOT NULL UNIQUE, opportunity_id INT NOT NULL,
        opportunity_category VARCHAR(40) NOT NULL, applicant_name VARCHAR(180) NOT NULL, email VARCHAR(200) NOT NULL,
        phone VARCHAR(60) NOT NULL, country VARCHAR(120) NULL, city VARCHAR(160) NULL, applicant_type VARCHAR(80) NULL,
        current_designation VARCHAR(180) NULL, experience DECIMAL(6,2) NULL, relevant_experience DECIMAL(6,2) NULL,
        expected_salary_or_budget DECIMAL(14,2) NULL, availability VARCHAR(140) NULL, university VARCHAR(220) NULL,
        degree VARCHAR(220) NULL, semester VARCHAR(80) NULL, company_name VARCHAR(220) NULL, website VARCHAR(400) NULL,
        linkedin_url VARCHAR(400) NULL, portfolio_url VARCHAR(400) NULL, cover_letter TEXT NULL, proposal TEXT NULL,
        fields_json TEXT NULL, resume_key VARCHAR(400) NULL, resume_name VARCHAR(255) NULL, resume_type VARCHAR(120) NULL,
        supporting_key VARCHAR(400) NULL, supporting_name VARCHAR(255) NULL, supporting_type VARCHAR(120) NULL,
        status VARCHAR(40) NOT NULL DEFAULT 'new', admin_notes TEXT NULL, source VARCHAR(80) NULL, ip_hash VARCHAR(64) NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, updated_at TIMESTAMP NULL DEFAULT NULL,
        deleted_at TIMESTAMP NULL DEFAULT NULL, INDEX(opportunity_id), INDEX(opportunity_category, status), INDEX(email), INDEX(created_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");
    safely_exec_schema('application_status_history', "CREATE TABLE IF NOT EXISTS application_status_history (
        id INT AUTO_INCREMENT PRIMARY KEY, application_id INT NOT NULL, old_status VARCHAR(40) NULL,
        new_status VARCHAR(40) NOT NULL, notes TEXT NULL, changed_by VARCHAR(200) NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, INDEX(application_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");
    safely_exec_schema('apply_rate_limits', "CREATE TABLE IF NOT EXISTS apply_rate_limits (
        id INT AUTO_INCREMENT PRIMARY KEY, ip_hash VARCHAR(64) NOT NULL, opportunity_id INT NOT NULL,
        email_hash VARCHAR(64) NOT NULL, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        INDEX(ip_hash, created_at), INDEX(opportunity_id, email_hash, created_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");
}

function apply_category_from_path($segment) { $all=apply_categories(); return $all[$segment] ?? null; }
function apply_slug($value) { $s=strtolower(trim(preg_replace('/[^a-z0-9]+/i','-',strip_tags((string)$value)),'-')); return $s ?: 'opportunity'; }
function apply_json($value) { $v=json_decode((string)$value,true); return is_array($v)?$v:[]; }
function apply_public_row($row) { $row['metadata']=apply_json($row['metadata']??''); $row['skills']=array_values(array_filter(array_map('trim',preg_split('/[,\n]+/',(string)($row['skills']??''))))); $row['is_open']=($row['status']==='published' && empty($row['deleted_at']) && (empty($row['application_deadline']) || $row['application_deadline']>=date('Y-m-d'))); return $row; }
function apply_client_ip() { return (string)($_SERVER['HTTP_CF_CONNECTING_IP'] ?? $_SERVER['REMOTE_ADDR'] ?? 'unknown'); }
function apply_admin_email() { return (string)($_SERVER['HTTP_X_ADMIN_EMAIL'] ?? ADMIN_EMAIL); }

function apply_opportunity_payload($body, $existing=[])
{
    $get=function($key,$default=null) use($body,$existing){ return array_key_exists($key,$body)?$body[$key]:($existing[$key]??$default); };
    $title=clean_text($get('title',''),240); $slug=apply_slug($get('slug',$title));
    $status=strtolower(clean_text($get('status','draft'),30));
    if(!in_array($status,['draft','published','inactive','closed','archived'],true)) $status='draft';
    $textKeys=['department','short_description','full_description','responsibilities','requirements','eligibility','location','work_mode','opportunity_type','duration','experience_level','benefits','start_date','application_deadline'];
    $p=['category'=>clean_text($get('category',''),40),'title'=>$title,'slug'=>$slug,'skills'=>clean_text(is_array($get('skills'))?implode(', ',$get('skills')):$get('skills',''),2000),'status'=>$status,'is_featured'=>!empty($get('is_featured'))?1:0];
    foreach($textKeys as $k) $p[$k]=clean_text($get($k,''),in_array($k,['full_description','responsibilities','requirements','eligibility','benefits'],true)?20000:600) ?: null;
    foreach(['salary_min','salary_max','stipend','budget_min','budget_max','investment_required'] as $k){$v=$get($k,null);$p[$k]=($v===''||$v===null)?null:(is_numeric($v)?(float)$v:null);}
    $meta=$get('metadata',[]); $p['metadata']=json_encode(is_array($meta)?$meta:apply_json($meta),JSON_UNESCAPED_UNICODE);
    if($p['category']==='internship'){foreach(['salary_min','salary_max','stipend','budget_min','budget_max','investment_required'] as $k)$p[$k]=null;}
    return $p;
}

function apply_validate_opportunity($p)
{
    $errors=[]; if(!$p['title'])$errors['title']='Title is required.'; if(!$p['category']||!in_array($p['category'],array_values(apply_categories()),true))$errors['category']='Invalid category.';
    if(!$p['short_description'])$errors['short_description']='Short description is required.'; if(!$p['full_description'])$errors['full_description']='Full description is required.';
    if($p['application_deadline'] && !preg_match('/^\d{4}-\d{2}-\d{2}$/',$p['application_deadline']))$errors['application_deadline']='Use YYYY-MM-DD.';
    foreach([['salary_min','salary_max'],['budget_min','budget_max']] as $r)if($p[$r[0]]!==null&&$p[$r[1]]!==null&&$p[$r[0]]>$p[$r[1]])$errors[$r[1]]='Maximum must be at least the minimum.';
    return $errors;
}

function apply_store_file($field,$folder,$required=false)
{
    $stored=store_upload($field,$folder,['.pdf','.doc','.docx'],['application/pdf','application/msword','application/vnd.openxmlformats-officedocument.wordprocessingml.document'],APPLY_MAX_FILE_SIZE,$required);
    if(isset($stored['error'])) error_response($stored['error'],422); return $stored['value']??null;
}

function handle_apply_module($method,$path,$pdo)
{
    if($method==='GET' && $path==='/api/apply/config') json_response(['success'=>true,'message'=>'Apply configuration','data'=>['categories'=>apply_categories(),'max_file_size'=>APPLY_MAX_FILE_SIZE,'allowed_files'=>['pdf','doc','docx']]]);

    if($method==='GET' && $path==='/api/admin/apply/dashboard'){
        require_admin(); $rows=$pdo->query("SELECT category, status, COUNT(*) total FROM opportunities WHERE deleted_at IS NULL GROUP BY category,status")->fetchAll();
        $apps=$pdo->query("SELECT opportunity_category category, status, COUNT(*) total FROM opportunity_applications WHERE deleted_at IS NULL GROUP BY opportunity_category,status")->fetchAll();
        $today=(int)$pdo->query("SELECT COUNT(*) FROM opportunity_applications WHERE deleted_at IS NULL AND DATE(created_at)=CURRENT_DATE")->fetchColumn();
        $monthSql=is_sqlite()?"SELECT COUNT(*) FROM opportunity_applications WHERE deleted_at IS NULL AND created_at >= date('now','start of month')":"SELECT COUNT(*) FROM opportunity_applications WHERE deleted_at IS NULL AND created_at >= DATE_FORMAT(CURRENT_DATE, '%Y-%m-01')";
        $month=(int)$pdo->query($monthSql)->fetchColumn();
        json_response(['success'=>true,'message'=>'Dashboard fetched','data'=>['opportunities'=>$rows,'applications'=>$apps,'today'=>$today,'month'=>$month]]);
    }

    if($method==='GET' && $path==='/api/admin/opportunities'){
        require_admin(); return apply_list_opportunities($pdo,null,true);
    }
    if($method==='POST' && $path==='/api/admin/opportunities'){
        require_admin(); $body=read_json_body(); if(!$body)error_response('Invalid JSON body',400); $p=apply_opportunity_payload($body); $e=apply_validate_opportunity($p); if($e)error_response('Please correct the highlighted fields',422,$e);
        $sql='INSERT INTO opportunities (category,title,slug,department,short_description,full_description,responsibilities,requirements,eligibility,skills,location,work_mode,opportunity_type,duration,salary_min,salary_max,stipend,budget_min,budget_max,investment_required,experience_level,benefits,metadata,start_date,application_deadline,status,is_featured,created_by,published_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,'.($p['status']==='published'?'CURRENT_TIMESTAMP':'NULL').')';
        try{$pdo->prepare($sql)->execute([$p['category'],$p['title'],$p['slug'],$p['department'],$p['short_description'],$p['full_description'],$p['responsibilities'],$p['requirements'],$p['eligibility'],$p['skills'],$p['location'],$p['work_mode'],$p['opportunity_type'],$p['duration'],$p['salary_min'],$p['salary_max'],$p['stipend'],$p['budget_min'],$p['budget_max'],$p['investment_required'],$p['experience_level'],$p['benefits'],$p['metadata'],$p['start_date'],$p['application_deadline'],$p['status'],$p['is_featured'],apply_admin_email()]);}catch(Throwable $x){error_response('Slug already exists or data is invalid',409);}
        $id=(int)$pdo->lastInsertId(); $s=$pdo->prepare('SELECT * FROM opportunities WHERE id=?');$s->execute([$id]);json_response(['success'=>true,'message'=>'Opportunity created','data'=>apply_public_row($s->fetch())],201);
    }
    if(preg_match('#^/api/admin/opportunities/(\d+)(?:/(restore|duplicate))?$#',$path,$m)){
        require_admin(); $id=(int)$m[1];$s=$pdo->prepare('SELECT * FROM opportunities WHERE id=?');$s->execute([$id]);$row=$s->fetch();if(!$row)error_response('Opportunity not found',404);
        if($method==='DELETE'){$pdo->prepare('UPDATE opportunities SET deleted_at=CURRENT_TIMESTAMP,status="archived",updated_at=CURRENT_TIMESTAMP WHERE id=?')->execute([$id]);json_response(['success'=>true,'message'=>'Opportunity archived','data'=>['id'=>$id]]);}
        if($method==='POST'&&($m[2]??'')==='restore'){$pdo->prepare('UPDATE opportunities SET deleted_at=NULL,status="draft",updated_at=CURRENT_TIMESTAMP WHERE id=?')->execute([$id]);json_response(['success'=>true,'message'=>'Opportunity restored','data'=>['id'=>$id]]);}
        if($method==='POST'&&($m[2]??'')==='duplicate'){$copy=$row;$copy['title'].=' (Copy)';$copy['slug'].='-copy-'.time();$copy['status']='draft';$copy['is_featured']=0;$_POST=[]; return apply_insert_duplicate($pdo,$copy);}
        if($method==='GET')json_response(['success'=>true,'message'=>'Opportunity fetched','data'=>apply_public_row($row)]);
        if($method==='PUT'){$body=read_json_body();$p=apply_opportunity_payload($body?:[],$row);$e=apply_validate_opportunity($p);if($e)error_response('Validation failed',422,$e);$keys=array_keys($p);$set=implode(',',array_map(fn($k)=>"$k=?",$keys));try{$pdo->prepare("UPDATE opportunities SET $set,updated_at=CURRENT_TIMESTAMP,published_at=CASE WHEN ?='published' AND published_at IS NULL THEN CURRENT_TIMESTAMP ELSE published_at END WHERE id=?")->execute(array_merge(array_values($p),[$p['status'],$id]));}catch(Throwable $x){error_response('Slug already exists or data is invalid',409);} $s->execute([$id]);json_response(['success'=>true,'message'=>'Opportunity updated','data'=>apply_public_row($s->fetch())]);}
    }

    if($method==='GET' && $path==='/api/admin/apply/applications') return apply_list_applications($pdo,true);
    if(preg_match('#^/api/admin/apply/applications/(\d+)(?:/(status|file)(?:/(resume|supporting))?)?$#',$path,$m)){
        require_admin();$id=(int)$m[1];$s=$pdo->prepare('SELECT a.*,o.title opportunity_title FROM opportunity_applications a LEFT JOIN opportunities o ON o.id=a.opportunity_id WHERE a.id=?');$s->execute([$id]);$a=$s->fetch();if(!$a)error_response('Application not found',404);
        if($method==='GET'&&($m[2]??'')==='file'){$kind=$m[3]??'resume';$key=$a[$kind.'_key'];if(!$key)error_response('File not found',404);stream_upload($key,$a[$kind.'_name'],$a[$kind.'_type']);}
        if($method==='GET'){$a['fields']=apply_json($a['fields_json']);unset($a['fields_json'],$a['ip_hash']);json_response(['success'=>true,'message'=>'Application fetched','data'=>$a]);}
        if($method==='PATCH'&&($m[2]??'')==='status'){$body=read_json_body();$allowed=['new','under_review','shortlisted','interview_scheduled','approved','hired','selected','rejected','on_hold','closed','proposal_received','under_evaluation','negotiation','awarded'];$new=strtolower(clean_text($body['status']??'',40));if(!in_array($new,$allowed,true))error_response('Invalid status',422);$notes=clean_text($body['admin_notes']??$a['admin_notes'],5000);$pdo->beginTransaction();$pdo->prepare('UPDATE opportunity_applications SET status=?,admin_notes=?,updated_at=CURRENT_TIMESTAMP WHERE id=?')->execute([$new,$notes,$id]);$pdo->prepare('INSERT INTO application_status_history(application_id,old_status,new_status,notes,changed_by) VALUES(?,?,?,?,?)')->execute([$id,$a['status'],$new,$notes,apply_admin_email()]);$pdo->commit();json_response(['success'=>true,'message'=>'Application status updated','data'=>['id'=>$id,'status'=>$new]]);}
    }

    if(preg_match('#^/api/(jobs|internships|partnerships|projects|project-based-hiring)(?:/([^/]+))?(?:/apply)?$#',$path,$m)){
        $segment=$m[1];$category=apply_category_from_path($segment);$identifier=$m[2]??null;$isApply=str_ends_with($path,'/apply');
        if($method==='GET'&&!$identifier)return apply_list_opportunities($pdo,$category,false);
        if($method==='GET'&&$identifier){$s=$pdo->prepare('SELECT * FROM opportunities WHERE category=? AND (slug=? OR id=?) AND status="published" AND deleted_at IS NULL');$s->execute([$category,$identifier,ctype_digit($identifier)?(int)$identifier:0]);$row=$s->fetch();if(!$row)error_response('Opportunity not found',404);json_response(['success'=>true,'message'=>'Opportunity fetched','data'=>apply_public_row($row)]);}
        if($method==='POST'&&$identifier&&$isApply)return apply_submit_application($pdo,$category,$identifier);
    }
}

function apply_insert_duplicate($pdo,$p){$cols=['category','title','slug','department','short_description','full_description','responsibilities','requirements','eligibility','skills','location','work_mode','opportunity_type','duration','salary_min','salary_max','stipend','budget_min','budget_max','investment_required','experience_level','benefits','metadata','start_date','application_deadline','status','is_featured','created_by'];$pdo->prepare('INSERT INTO opportunities('.implode(',',$cols).') VALUES('.implode(',',array_fill(0,count($cols),'?')).')')->execute(array_map(fn($k)=>$p[$k]??null,$cols));json_response(['success'=>true,'message'=>'Opportunity duplicated','data'=>['id'=>(int)$pdo->lastInsertId()]],201);}

function apply_list_opportunities($pdo,$category,$admin)
{
    if($admin)require_admin();$page=max(1,(int)($_GET['page']??1));$limit=min(100,max(1,(int)($_GET['limit']??12)));$where=[];$params=[];
    if($category){$where[]='category=?';$params[]=$category;} if(!$admin){$where[]='status="published"';$where[]='deleted_at IS NULL';if(($_GET['active']??'1')!=='0')$where[]='(application_deadline IS NULL OR application_deadline="" OR application_deadline>=?)';$params[]=date('Y-m-d');} elseif(empty($_GET['include_archived']))$where[]='deleted_at IS NULL';
    foreach(['status','work_mode','department','opportunity_type'] as $f)if(!empty($_GET[$f])){$where[]="$f=?";$params[]=clean_text($_GET[$f],140);}if(!empty($_GET['category'])&&$admin){$where[]='category=?';$params[]=clean_text($_GET['category'],40);}if(!empty($_GET['search'])){$q='%'.clean_text($_GET['search'],120).'%';$where[]='(title LIKE ? OR short_description LIKE ? OR skills LIKE ? OR location LIKE ?)';array_push($params,$q,$q,$q,$q);}
    $ws=$where?' WHERE '.implode(' AND ',$where):'';$sort=['newest'=>'created_at DESC','oldest'=>'created_at ASC','deadline'=>'application_deadline ASC','title'=>'title ASC'][$_GET['sort']??'newest']??'created_at DESC';$c=$pdo->prepare('SELECT COUNT(*) FROM opportunities'.$ws);$c->execute($params);$total=(int)$c->fetchColumn();$s=$pdo->prepare('SELECT * FROM opportunities'.$ws.' ORDER BY is_featured DESC,'.$sort.' LIMIT '.(int)$limit.' OFFSET '.(int)(($page-1)*$limit));$s->execute($params);$rows=array_map('apply_public_row',$s->fetchAll());json_response(['success'=>true,'message'=>'Opportunities fetched','data'=>$rows,'meta'=>pagination_meta($page,$limit,$total)]);
}

function apply_submit_application($pdo,$category,$identifier)
{
    $s=$pdo->prepare('SELECT * FROM opportunities WHERE category=? AND (id=? OR slug=?) AND deleted_at IS NULL');$s->execute([$category,ctype_digit($identifier)?(int)$identifier:0,$identifier]);$o=$s->fetch();if(!$o)error_response('Opportunity not found',404);if($o['status']!=='published')error_response('This opportunity is not accepting applications',409);if($o['application_deadline']&&$o['application_deadline']<date('Y-m-d'))error_response('The application deadline has passed',409);
    $name=clean_text($_POST['full_name']??'',180);$email=clean_text($_POST['email']??'',200);$phone=clean_text($_POST['phone']??'',60);$errors=[];if(strlen($name)<2)$errors['full_name']='Enter a valid full name.';if(!is_valid_email($email))$errors['email']='Enter a valid email.';if(!is_valid_phone($phone))$errors['phone']='Enter a valid phone.';if(empty($_POST['agreement']))$errors['agreement']='You must accept the agreement.';
    foreach(['linkedin_url','portfolio_url','website'] as $f)if(!empty($_POST[$f])&&optional_url($_POST[$f])===false)$errors[$f]='Enter a valid URL.';if($errors)error_response('Please correct the highlighted fields',422,$errors);
    $ipHash=hash('sha256',apply_client_ip().'|'.APP_SECRET);$emailHash=hash('sha256',strtolower($email));$cut=date('Y-m-d H:i:s',time()-APPLY_RATE_WINDOW);$r=$pdo->prepare('SELECT COUNT(*) FROM apply_rate_limits WHERE (ip_hash=? OR (opportunity_id=? AND email_hash=?)) AND created_at>=?');$r->execute([$ipHash,$o['id'],$emailHash,$cut]);if((int)$r->fetchColumn()>=APPLY_RATE_LIMIT)error_response('Too many submissions. Please try again later.',429);
    $resume=apply_store_file('resume','apply/'.$category.'/'.$o['id'],in_array($category,['job','internship','project_based_hiring'],true));$support=apply_store_file('supporting_document','apply/'.$category.'/'.$o['id'],false);
    $known=['full_name','email','phone','country','city','applicant_type','current_designation','total_experience','relevant_experience','expected_salary_or_budget','availability','university','degree','semester','company_name','website','linkedin_url','portfolio_url','cover_letter','proposal','agreement'];$extra=[];foreach($_POST as $k=>$v)if(!in_array($k,['agreement'],true))$extra[$k]=clean_text($v,10000);
    $ref='GIS-'.strtoupper(substr($category,0,3)).'-'.date('ymd').'-'.strtoupper(bin2hex(random_bytes(3)));$sql='INSERT INTO opportunity_applications(reference_number,opportunity_id,opportunity_category,applicant_name,email,phone,country,city,applicant_type,current_designation,experience,relevant_experience,expected_salary_or_budget,availability,university,degree,semester,company_name,website,linkedin_url,portfolio_url,cover_letter,proposal,fields_json,resume_key,resume_name,resume_type,supporting_key,supporting_name,supporting_type,status,source,ip_hash) VALUES('.implode(',',array_fill(0,33,'?')).')';
    $vals=[$ref,$o['id'],$category,$name,$email,$phone,clean_text($_POST['country']??'',120),clean_text($_POST['city']??'',160),clean_text($_POST['applicant_type']??'',80),clean_text($_POST['current_designation']??'',180),is_numeric($_POST['total_experience']??null)?(float)$_POST['total_experience']:null,is_numeric($_POST['relevant_experience']??null)?(float)$_POST['relevant_experience']:null,is_numeric($_POST['expected_salary_or_budget']??null)?(float)$_POST['expected_salary_or_budget']:null,clean_text($_POST['availability']??'',140),clean_text($_POST['university']??'',220),clean_text($_POST['degree']??'',220),clean_text($_POST['semester']??'',80),clean_text($_POST['company_name']??'',220),optional_url($_POST['website']??'')?:null,optional_url($_POST['linkedin_url']??'')?:null,optional_url($_POST['portfolio_url']??'')?:null,clean_text($_POST['cover_letter']??'',10000),clean_text($_POST['proposal']??'',10000),json_encode($extra,JSON_UNESCAPED_UNICODE),$resume['key']??null,$resume['fileName']??null,$resume['fileType']??null,$support['key']??null,$support['fileName']??null,$support['fileType']??null,'new','website',$ipHash];
    try{$pdo->beginTransaction();$pdo->prepare($sql)->execute($vals);$id=(int)$pdo->lastInsertId();$pdo->prepare('INSERT INTO apply_rate_limits(ip_hash,opportunity_id,email_hash) VALUES(?,?,?)')->execute([$ipHash,$o['id'],$emailHash]);$pdo->prepare('INSERT INTO application_status_history(application_id,new_status,notes) VALUES(?,"new","Application submitted")')->execute([$id]);$pdo->commit();}catch(Throwable $x){if($pdo->inTransaction())$pdo->rollBack();if($resume&&!empty($resume['key']))@unlink(UPLOAD_DIR.'/'.$resume['key']);if($support&&!empty($support['key']))@unlink(UPLOAD_DIR.'/'.$support['key']);throw $x;}
    json_response(['success'=>true,'message'=>'Application submitted successfully','data'=>['id'=>$id,'reference_number'=>$ref,'status'=>'new'],'reference_number'=>$ref],201);
}

function apply_list_applications($pdo,$admin)
{
    require_admin();$page=max(1,(int)($_GET['page']??1));$limit=min(100,max(1,(int)($_GET['limit']??25)));$w=['a.deleted_at IS NULL'];$p=[];foreach(['opportunity_category'=>'a.opportunity_category','status'=>'a.status','opportunity_id'=>'a.opportunity_id'] as $q=>$col)if(!empty($_GET[$q])){$w[]="$col=?";$p[]=clean_text($_GET[$q],80);}if(!empty($_GET['search'])){$v='%'.clean_text($_GET['search'],120).'%';$w[]='(a.applicant_name LIKE ? OR a.email LIKE ? OR a.reference_number LIKE ? OR o.title LIKE ?)';array_push($p,$v,$v,$v,$v);}$ws=' WHERE '.implode(' AND ',$w);$c=$pdo->prepare('SELECT COUNT(*) FROM opportunity_applications a LEFT JOIN opportunities o ON o.id=a.opportunity_id'.$ws);$c->execute($p);$total=(int)$c->fetchColumn();$s=$pdo->prepare('SELECT a.id,a.reference_number,a.opportunity_id,a.opportunity_category,a.applicant_name,a.email,a.phone,a.status,a.resume_key,a.supporting_key,a.created_at,o.title opportunity_title FROM opportunity_applications a LEFT JOIN opportunities o ON o.id=a.opportunity_id'.$ws.' ORDER BY a.created_at DESC LIMIT '.(int)$limit.' OFFSET '.(int)(($page-1)*$limit));$s->execute($p);json_response(['success'=>true,'message'=>'Applications fetched','data'=>$s->fetchAll(),'meta'=>pagination_meta($page,$limit,$total)]);
}
